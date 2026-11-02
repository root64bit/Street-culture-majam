import { expect, test, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const orderId = 'a1000000-0000-4000-8000-000000000001';
const paymentId = 'a1000000-0000-4000-8000-000000000002';

async function addFirstLivePiece(page: Page) {
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Most Wanted products' });
  await expect(carousel).toBeVisible();
  await carousel.getByRole('button', { name: 'Quick buy' }).first().click();
  const quickBuy = page.getByRole('dialog', { name: 'Quick buy' });
  await expect(quickBuy.getByText('Select size')).toBeVisible();
  await quickBuy.getByRole('button', { name: '10.5' }).click();
  await quickBuy.getByRole('button', { name: 'Add to bag' }).click();
  await expect(page.getByRole('dialog', { name: 'Your bag · 1' })).toBeVisible();
}

async function reachReview(page: Page, method: 'mpesa' | 'card' | 'applePay' = 'mpesa') {
  await page.route('**/api/checkout/shipping', async (route) => {
    await route.fulfill({
      json: {
        methods: [
          {
            id: 'a1000000-0000-4000-8000-000000000003',
            code: 'TEST_MAPUTO',
            name: 'Test Maputo delivery',
            description: 'Test courier service',
            price: 125,
            currency: 'MZN',
            provider_price: 35,
            provider_currency: 'ZAR',
            estimated_min_days: 1,
            estimated_max_days: 3,
          },
        ],
      },
    });
  });
  await addFirstLivePiece(page);
  await page
    .getByRole('dialog', { name: 'Your bag · 1' })
    .getByRole('button', { name: /Checkout/ })
    .click();
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await checkout.getByLabel('Full name').fill('Test Buyer');
  await checkout.getByLabel('Email').fill('buyer@example.invalid');
  await checkout.getByLabel('Phone').fill('841234567');
  await checkout.getByRole('button', { name: 'Continue' }).click();
  await checkout.getByLabel('Address line 1').fill('Rua Teste 12');
  await checkout.getByLabel('Suburb / local area').fill('Polana');
  await checkout.getByLabel('Postal code').fill('1100');
  await expect(checkout.getByText('Test Maputo delivery')).toBeVisible();
  await checkout.getByRole('button', { name: 'Continue' }).click();
  await expect(checkout.getByText('M-Pesa', { exact: true })).toBeVisible();
  if (method !== 'mpesa')
    await checkout
      .getByRole('button', { name: method === 'card' ? /^Card/ : /^Apple Pay/ })
      .click();
  await checkout.getByRole('button', { name: 'Continue' }).click();
  await expect(checkout.getByText('Ready when you are.')).toBeVisible();
}

async function mockSquareCheckout(page: Page, applePayAvailable = true, mockSdk = true) {
  if (mockSdk)
    await page.addInitScript(
      ({ applePayAvailable }) => {
        Object.assign(window, {
          Square: {
            payments: () => ({
              card: async () => ({
                attach: async (element: HTMLElement) => {
                  element.textContent = 'Secure card fields';
                },
                destroy: async () => {},
                tokenize: async (details: unknown) => {
                  Object.assign(window, { squareVerification: details });
                  return { status: 'OK', token: 'mock-card-token' };
                },
              }),
              paymentRequest: (options: unknown) => options,
              applePay: async () => {
                if (!applePayAvailable) throw new Error('Not supported');
                return {
                  destroy: async () => {},
                  tokenize: async () => ({ status: 'OK', token: 'mock-apple-token' }),
                };
              },
            }),
          },
        });
      },
      { applePayAvailable }
    );
  await page.route('**/api/checkout/orders', (route) =>
    route.fulfill({
      json: {
        orderId,
        orderNumber: 'SCSQUARE01',
        subtotal: 1000,
        shipping: 125,
        total: 1125,
      },
    })
  );
  await page.route('**/api/payments/square/quote', (route) =>
    route.fulfill({
      json: {
        orderId,
        paymentId,
        orderNumber: 'SCSQUARE01',
        totalMzn: 1125,
        amount: 13.5,
        amountMinor: 1350,
        currency: 'GBP',
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      },
    })
  );
}

test('Square live SDK loads secure card fields without submitting a charge', async ({ page }) => {
  test.skip(
    process.env.SQUARE_LIVE_SDK_CHECK !== 'true',
    'Explicit, non-charging production SDK check'
  );
  await mockSquareCheckout(page, true, false);
  let chargeRequests = 0;
  await page.route('**/api/payments/square', (route) => {
    chargeRequests++;
    return route.abort();
  });
  await reachReview(page, 'card');
  await expect(page.getByRole('button', { name: 'Pay £13.50', exact: true })).toBeEnabled({
    timeout: 25000,
  });
  expect(await page.locator('iframe').count()).toBeGreaterThan(0);
  expect(chargeRequests).toBe(0);
});

test('Square card checkout shows the exact GBP charge and verifies the buyer', async ({ page }) => {
  await mockSquareCheckout(page);
  let submitted: Record<string, unknown> | null = null;
  await page.route('**/api/payments/square', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      json: { status: 'PAID', fulfillable: true, orderNumber: 'SCSQUARE01' },
    });
  });
  await reachReview(page, 'card');
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await expect(checkout.getByText('Secure card fields')).toBeVisible();
  await checkout.getByRole('button', { name: 'Pay £13.50', exact: true }).click();
  await expect(checkout.getByRole('heading', { name: 'Order confirmed.' })).toBeVisible();
  expect(submitted).toEqual({
    order_id: orderId,
    payment_id: paymentId,
    source_id: 'mock-card-token',
  });
  const verification = await page.evaluate(
    () => (window as unknown as { squareVerification: unknown }).squareVerification
  );
  expect(verification).toMatchObject({
    amount: '13.50',
    currencyCode: 'GBP',
    intent: 'CHARGE',
    customerInitiated: true,
    sellerKeyedIn: false,
  });
  await expect(checkout.getByText('£13.50', { exact: true })).toBeVisible();
});

test('Square Apple Pay sends the wallet token and confirms the order', async ({ page }) => {
  await mockSquareCheckout(page);
  let token = '';
  await page.route('**/api/payments/square', (route) => {
    token = route.request().postDataJSON().source_id;
    return route.fulfill({
      json: { status: 'PAID', fulfillable: true, orderNumber: 'SCSQUARE01' },
    });
  });
  await reachReview(page, 'applePay');
  await page.getByRole('button', { name: 'Pay £13.50 with Apple Pay' }).click();
  await expect(page.getByRole('heading', { name: 'Order confirmed.' })).toBeVisible();
  expect(token).toBe('mock-apple-token');
});

test('Square Apple Pay offers a card fallback on unsupported devices', async ({ page }) => {
  await mockSquareCheckout(page, false);
  await reachReview(page, 'applePay');
  await expect(
    page.getByText('Apple Pay is unavailable on this device or browser.', { exact: false })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pay by card instead' }).click();
  await expect(page.getByText('Secure card fields')).toBeVisible();
});

test('Square declines allow retry and uncertain results reconcile without another charge', async ({
  page,
}) => {
  await mockSquareCheckout(page);
  let charges = 0;
  await page.route('**/api/payments/square', (route) => {
    charges++;
    return charges === 1
      ? route.fulfill({ status: 402, json: { error: 'The card was declined.' } })
      : route.fulfill({ status: 202, json: { status: 'PROCESSING' } });
  });
  await page.route('**/api/payments/square/status', (route) =>
    route.fulfill({
      json: {
        status: 'PAID',
        fulfillable: true,
        orderNumber: 'SCSQUARE01',
      },
    })
  );
  await reachReview(page, 'card');
  await page.getByRole('button', { name: 'Pay £13.50', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Secure checkout' }).getByRole('alert')
  ).toContainText('declined');
  await page.getByRole('button', { name: 'Try payment again' }).click();
  await page.getByRole('button', { name: 'Pay £13.50', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order confirmed.' })).toBeVisible();
  expect(charges).toBe(2);
});

test('homepage uses the supplied brand mark and lists real live inventory', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Street Culture — Authentic Only' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /AUTHENTICITY/ })).toBeVisible();
  const productCards = page
    .getByRole('region', { name: 'Most Wanted products' })
    .locator('article');
  await expect(productCards).toHaveCount(5);
  const productLinks = await productCards
    .locator('a[href^="/products/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(new Set(productLinks).size).toBe(productLinks.length);
});

test('a guest wishlist persists locally across a reload', async ({ page }) => {
  const wishlistLoaded = page.waitForResponse(
    (response) => response.url().endsWith('/api/wishlist') && response.request().method() === 'GET'
  );
  await page.goto('/');
  await wishlistLoaded;
  const carousel = page.getByRole('region', { name: 'Most Wanted products' });
  const firstPiece = carousel.locator('article').first();
  const addButton = firstPiece.getByRole('button', { name: /Add .* to wishlist/ });
  await addButton.click();
  await expect(firstPiece.getByRole('button', { name: /Remove .* from wishlist/ })).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: 'Most Wanted products' })
      .locator('article')
      .first()
      .getByRole('button', { name: /Remove .* from wishlist/ })
  ).toBeVisible();
});

test('Most Wanted quick buy adds the selected listing to the bag', async ({ page }) => {
  await addFirstLivePiece(page);
  await expect(
    page.getByRole('dialog', { name: 'Your bag · 1' }).getByText('One-of-one · Qty 1')
  ).toBeVisible();
});

test('editorial product carousel advances and stays controllable', async ({ page }) => {
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Most Wanted products' });
  await carousel.scrollIntoViewIfNeeded();
  const position = page.getByRole('progressbar', { name: 'Carousel position' });
  await expect(position).toHaveAttribute('aria-valuenow', '1');
  await expect.poll(() => position.getAttribute('aria-valuenow'), { timeout: 9000 }).toBe('2');
  await page.getByRole('button', { name: 'Pause carousel' }).click();
  await page.getByRole('button', { name: 'Next Most Wanted products' }).click();
  await expect(position).toHaveAttribute('aria-valuenow', '3');
  await page.getByRole('button', { name: 'Previous Most Wanted products' }).click();
  await expect(position).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByRole('button', { name: 'Play carousel' })).toBeVisible();
});

test('carousel autoplay pauses while a shopper examines the rail', async ({ page }) => {
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Most Wanted products' });
  await carousel.scrollIntoViewIfNeeded();
  const position = page.getByRole('progressbar', { name: 'Carousel position' });
  await expect(position).toHaveAttribute('aria-valuenow', '1');
  await carousel.hover();
  await page.waitForTimeout(5200);
  await expect(position).toHaveAttribute('aria-valuenow', '1');
});

test('carousel category filters reset its real slide count and low-count controls', async ({
  page,
}) => {
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Most Wanted products' });
  await carousel.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'SNEAKERS' }).click();
  await expect(carousel.locator('article')).toHaveCount(3);
  await expect(page.getByRole('progressbar', { name: 'Carousel position' })).toHaveAttribute(
    'aria-valuemax',
    '3'
  );
  await expect(page.getByRole('button', { name: 'Next Most Wanted products' })).toBeDisabled();
  await page.getByRole('button', { name: 'BAGS' }).click();
  await expect(carousel.locator('article')).toHaveCount(1);
  await expect(carousel.getByText('Louis Vuitton Horizon 55 Monogram Eclipse')).toBeVisible();
});

test('View Piece opens the matching dynamic product page', async ({ page }) => {
  await page.goto('/');
  const firstCard = page
    .getByRole('region', { name: 'Most Wanted products' })
    .locator('article')
    .first();
  const name = await firstCard.getByRole('heading').innerText();
  await firstCard.getByRole('link', { name: 'View piece' }).click();
  await expect(page).toHaveURL(/\/products\//);
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
});

test('reduced-motion visitors can move the carousel manually', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'Most Wanted products' });
  const position = page.getByRole('progressbar', { name: 'Carousel position' });
  await expect(page.getByText('Manual motion')).toBeVisible();
  const total = await carousel.locator('article').count();
  for (let index = 2; index <= total; index++) {
    await page.getByRole('button', { name: 'Next Most Wanted products' }).click();
    await expect(position).toHaveAttribute('aria-valuenow', String(index));
  }
  const lastCardVisibility = await carousel
    .locator('article')
    .last()
    .evaluate((card) => {
      const cardBounds = card.getBoundingClientRect();
      const railBounds = card.parentElement!.getBoundingClientRect();
      return (
        (Math.min(cardBounds.right, railBounds.right) -
          Math.max(cardBounds.left, railBounds.left)) /
        cardBounds.width
      );
    });
  expect(lastCardVisibility).toBeGreaterThan(0.7);
  await page.getByRole('button', { name: 'Next Most Wanted products' }).click();
  await expect(position).toHaveAttribute('aria-valuenow', '1');
});

test('search and category pages query the live catalog', async ({ page }) => {
  await page.goto('/search?q=Jordan');
  await expect(
    page.getByText("Air Jordan 1 Retro High OG 'Chicago Lost & Found'").first()
  ).toBeVisible();
  await page.goto('/sneakers');
  await expect(page.getByRole('heading', { name: 'SNEAKERS' })).toBeVisible();
  await expect(page.locator('article').first()).toBeVisible();
});

test('mocked M-Pesa confirmation shows the order summary without contacting MineScope', async ({
  page,
}) => {
  await page.route('**/api/checkout/orders', (route) =>
    route.fulfill({
      json: {
        orderId,
        orderNumber: 'SC1234ABCD',
        subtotal: 2840,
        shipping: 125,
        total: 2965,
      },
    })
  );
  await page.route('**/api/payments/mpesa/initiate', (route) =>
    route.fulfill({
      status: 202,
      json: {
        orderId,
        orderNumber: 'SC1234ABCD',
        paymentId,
        status: 'PENDING',
      },
    })
  );
  await page.route('**/api/payments/*/status?*', (route) =>
    route.fulfill({
      json: {
        status: 'PAID',
        orderStatus: 'CONFIRMED',
        orderNumber: 'SC1234ABCD',
        fulfillable: true,
      },
    })
  );
  await reachReview(page);
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await checkout.getByRole('button', { name: 'Continue with M-Pesa' }).click();
  await expect(checkout.getByRole('heading', { name: 'Order confirmed.' })).toBeVisible();
  await expect(checkout.getByText('SC1234ABCD')).toBeVisible();
  await expect(checkout.getByRole('link', { name: 'Track order' })).toHaveAttribute(
    'href',
    '/order/SC1234ABCD'
  );
});

test('M-Pesa totals above 75,000 MZN are confirmed through sequential installments', async ({
  page,
}) => {
  const installmentPaymentIds = [
    'a1000000-0000-4000-8000-000000000011',
    'a1000000-0000-4000-8000-000000000012',
    'a1000000-0000-4000-8000-000000000013',
  ];
  let initiationIndex = 0;
  let statusIndex = 0;

  await page.route('**/api/checkout/orders', (route) =>
    route.fulfill({
      json: {
        orderId,
        orderNumber: 'SCSPLIT001',
        subtotal: 159875,
        shipping: 125,
        total: 160000,
      },
    })
  );
  await page.route('**/api/payments/mpesa/initiate', (route) => {
    const current = initiationIndex++;
    const paidAmount = current * 75_000;
    const installmentAmount = current === 2 ? 10_000 : 75_000;
    return route.fulfill({
      status: 202,
      json: {
        orderId,
        orderNumber: 'SCSPLIT001',
        paymentId: installmentPaymentIds[current],
        status: 'PENDING',
        paidAmount,
        remainingAmount: 160_000 - paidAmount,
        nextInstallmentAmount: installmentAmount,
        installmentAmount,
        installmentNumber: current + 1,
        installmentCount: 3,
      },
    });
  });
  await page.route('**/api/payments/*/status?*', (route) => {
    const current = statusIndex++;
    const paidAmount = current === 0 ? 75_000 : current === 1 ? 150_000 : 160_000;
    const remainingAmount = 160_000 - paidAmount;
    return route.fulfill({
      json: {
        status: current < 2 ? 'PARTIALLY_PAID' : 'PAID',
        orderStatus: current < 2 ? 'PENDING' : 'CONFIRMED',
        orderNumber: 'SCSPLIT001',
        fulfillable: current === 2,
        paidAmount,
        remainingAmount,
        nextInstallmentAmount: current === 0 ? 75_000 : current === 1 ? 10_000 : 0,
        installmentNumber: Math.min(current + 2, 3),
        installmentCount: 3,
      },
    });
  });

  await reachReview(page);
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await checkout.getByRole('button', { name: 'Continue with M-Pesa' }).click();
  await expect(checkout.getByText('Installment confirmed')).toBeVisible();
  await expect(checkout.getByText(/75[,.\s]000/).first()).toBeVisible();

  await checkout.getByRole('button', { name: 'Pay installment 2 of 3' }).click();
  await expect(checkout.getByRole('button', { name: 'Pay installment 3 of 3' })).toBeVisible();
  await checkout.getByRole('button', { name: 'Pay installment 3 of 3' }).click();

  await expect(checkout.getByRole('heading', { name: 'Order confirmed.' })).toBeVisible();
  await expect(checkout.getByText('SCSPLIT001')).toBeVisible();
  expect(initiationIndex).toBe(3);
  expect(statusIndex).toBe(3);
});

test('mocked declined payment leaves the customer in checkout with a clear retry', async ({
  page,
}) => {
  await page.route('**/api/checkout/orders', (route) =>
    route.fulfill({
      json: {
        orderId,
        orderNumber: 'SC1234ABCD',
        subtotal: 2840,
        shipping: 125,
        total: 2965,
      },
    })
  );
  await page.route('**/api/payments/mpesa/initiate', (route) =>
    route.fulfill({
      status: 202,
      json: {
        orderId,
        orderNumber: 'SC1234ABCD',
        paymentId,
        status: 'PENDING',
      },
    })
  );
  await page.route('**/api/payments/*/status?*', (route) =>
    route.fulfill({
      json: {
        status: 'FAILED',
        orderStatus: 'CANCELLED',
        orderNumber: 'SC1234ABCD',
      },
    })
  );
  await reachReview(page);
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await checkout.getByRole('button', { name: 'Continue with M-Pesa' }).click();
  await expect(checkout.getByRole('alert')).toContainText('not completed');
  await expect(checkout.getByRole('button', { name: 'Continue with M-Pesa' })).toBeEnabled();
});

test('mobile carousel remains horizontally swipeable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const width of [390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const carousel = page.getByRole('region', { name: 'Most Wanted products' });
    const dimensions = await carousel.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('430px guest checkout keeps address and M-Pesa review usable', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 844 });
  await reachReview(page);
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await expect(checkout.getByText('Test Maputo delivery')).toBeVisible();
  await expect(checkout.getByRole('button', { name: 'Continue with M-Pesa' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('sign-in, sign-up, consignment and health routes remain available', async ({
  page,
  request,
}) => {
  await page.goto('/auth/sign-in');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await page.goto('/auth/sign-up');
  await expect(page.getByRole('heading', { name: 'CREATE AN ACCOUNT' })).toBeVisible();
  await page.goto('/consign');
  await expect(
    page.getByRole('link', { name: /Submit item for consignment/i }).first()
  ).toBeVisible();
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
});

test('signed-in customer sees only their own order and consignment status', async ({
  page,
  request,
}) => {
  const url = process.env.LOCAL_SUPABASE_TEST_URL;
  const key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
  test.skip(!url || !key, 'Local Supabase test credentials are required.');
  const admin = createClient(url!, key!, { auth: { persistSession: false } });
  const email = `browser-buyer-${randomUUID()}@example.invalid`;
  const password = `Test-${randomBytes(12).toString('hex')}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error('Test user missing');
  const userId = created.user.id;
  const orderId = randomUUID();
  const submissionId = randomUUID();
  const orderNumber = `SC${randomBytes(4).toString('hex').toUpperCase()}`;
  try {
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ id: userId, account_type: 'BOTH' });
    if (profileError) throw profileError;
    const { error: orderError } = await admin.from('orders').insert({
      id: orderId,
      user_id: userId,
      order_number: orderNumber,
      status: 'CONFIRMED',
      payment_status: 'PAID',
      fulfillment_status: 'UNFULFILLED',
      currency: 'MZN',
      subtotal: 1000,
      shipping_amount: 125,
      total_amount: 1125,
      shipping_address_snapshot: {
        address_line_1: 'Test street',
        city: 'Maputo',
        province: 'Maputo',
      },
      shipping_method_snapshot: { name: 'Test delivery' },
    });
    if (orderError) throw orderError;
    const { error: itemError } = await admin.from('order_items').insert({
      order_id: orderId,
      product_name_snapshot: 'Test verified piece',
      brand_name_snapshot: 'A/X',
      size_snapshot: '10.5',
      condition_snapshot: 'NEW',
      unit_price: 1000,
      quantity: 1,
    });
    if (itemError) throw itemError;
    const { error: submissionError } = await admin.from('consignment_submissions').insert({
      id: submissionId,
      seller_id: userId,
      brand_name: 'A/X',
      product_name: 'Test sold consignment',
      size: '10.5',
      condition: 'NEW',
      expected_price: 1000,
      currency: 'MZN',
      status: 'SOLD',
    });
    if (submissionError) throw submissionError;

    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name.endsWith('-auth-token'))
      )
      .toBe(true);
    await page.goto('/account/orders');
    await expect(page.getByText(orderNumber)).toBeVisible();
    await page.goto(`/order/${orderNumber}`);
    await expect(page.getByRole('heading', { name: 'Your order' })).toBeVisible();
    const anonymousLookup = await request.get(`/order/${orderNumber}`);
    expect(anonymousLookup.status()).toBe(404);
    await page.goto('/account/consignments');
    await expect(page.getByText('Test sold consignment')).toBeVisible();
    await expect(page.getByText('Sold · payout pending')).toBeVisible();
    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/auth/sign-in');
  } finally {
    await admin.from('consignment_submissions').delete().eq('id', submissionId);
    await admin.from('orders').delete().eq('id', orderId);
    await admin.auth.admin.deleteUser(userId);
  }
});

test('admin can create an unpublished catalog draft while staff remains read-only', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const url = process.env.LOCAL_SUPABASE_TEST_URL;
  const serviceKey = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
  const anonKey = process.env.LOCAL_SUPABASE_TEST_ANON_KEY;
  test.skip(!url || !serviceKey || !anonKey, 'Local Supabase test credentials are required.');
  const denied = await request.post('/api/admin/products', { data: {} });
  expect(denied.status()).toBe(401);

  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const email = `catalog-admin-${randomUUID()}@example.invalid`;
  const staffEmail = `catalog-staff-${randomUUID()}@example.invalid`;
  const password = `Test-${randomBytes(12).toString('hex')}`;
  const customerEmail = `catalog-customer-${randomUUID()}@example.invalid`;
  const name = `Catalog draft ${randomUUID()}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error('Staff user missing');
  const userId = created.user.id;
  const { data: customer, error: customerError } = await admin.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
  });
  if (customerError || !customer.user) throw customerError ?? new Error('Customer user missing');
  const customerId = customer.user.id;
  const { data: staff, error: staffError } = await admin.auth.admin.createUser({
    email: staffEmail,
    password,
    email_confirm: true,
  });
  if (staffError || !staff.user) throw staffError ?? new Error('Staff user missing');
  const staffId = staff.user.id;
  let productId: string | null = null;
  try {
    const { error: roleError } = await admin.from('user_roles').insert([
      { user_id: userId, role: 'ADMIN' },
      { user_id: staffId, role: 'STAFF' },
    ]);
    if (roleError) throw roleError;
    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill(customerEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name.endsWith('-auth-token'))
      )
      .toBe(true);
    await page.waitForURL('**/account');
    const customerPosts = await page.evaluate(async () => {
      const productResponse = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const listingResponse = await fetch(
        '/api/admin/products/00000000-0000-4000-8000-000000000001/listings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }
      );
      return [productResponse.status, listingResponse.status];
    });
    expect(customerPosts).toEqual([403, 403]);
    await page.goto('/admin/products/new');
    await expect(page.getByText('This page could not be found.')).toBeVisible();

    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill(staffEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/account');
    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New draft' })).toHaveCount(0);
    await page.goto('/admin/products/new');
    await expect(page.getByText('This page could not be found.')).toBeVisible();

    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((cookie) => cookie.name.endsWith('-auth-token'))
      )
      .toBe(true);
    await page.waitForURL('**/account');
    await expect(page.getByRole('link', { name: /STAFF PANEL/ })).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'The whole picture.' })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Admin navigation' })
        .getByRole('link', { name: 'Inventory' })
    ).toBeVisible();
    await page.goto('/admin/inventory');
    await expect(page.getByRole('heading', { name: 'Every unit, accounted for.' })).toBeVisible();
    await page.goto('/admin/orders');
    await expect(page.getByRole('heading', { name: 'Orders in motion.' })).toBeVisible();
    await page.goto('/admin/payments');
    await expect(page.getByRole('heading', { name: 'Money, verified.' })).toBeVisible();
    await page.goto('/admin/payments/reconciliation');
    await expect(page.getByRole('heading', { name: 'Reconcile with evidence.' })).toBeVisible();
    await page.goto('/admin/consignments');
    await expect(page.getByRole('heading', { name: 'Consignments.' })).toBeVisible();
    await page.goto('/admin/authentication');
    await expect(page.getByRole('heading', { name: 'Authentication queue.' })).toBeVisible();
    await page.goto('/admin/payouts');
    await expect(page.getByRole('heading', { name: 'Payouts, controlled.' })).toBeVisible();
    await page.goto('/admin/products/new');
    await expect(page.getByRole('heading', { name: 'NEW PRODUCT.' })).toBeVisible();
    await page.getByLabel('Product name *').fill(name);
    await page.getByLabel('Brand *').selectOption({ label: 'Nike' });
    await page.getByLabel('Category *').selectOption({ label: 'Sneakers' });
    await page.getByLabel('Product photos').setInputFiles({
      name: 'test-draft.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
        'base64'
      ),
    });
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Product workspace tabs' })
      .getByRole('link', { name: 'media', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible();
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id, active, currency, product_media(storage_path), listings(id)')
      .eq('name', name)
      .single();
    if (productError || !product) throw productError ?? new Error('Draft product missing');
    productId = product.id;
    await page.goto('/admin/products');
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByRole('img', { name: `${name} product image` })).toBeVisible();
    await page.goto(`/admin/products/${productId}?tab=listings`);
    expect(product.active).toBe(false);
    expect(product.currency).toBe('MZN');
    expect(product.listings).toHaveLength(0);
    expect(product.product_media).toHaveLength(1);
    const [{ data: publicProduct }, { data: publicMedia }] = await Promise.all([
      anon.from('products').select('id').eq('id', productId),
      anon.from('product_media').select('id').eq('product_id', productId),
    ]);
    expect(publicProduct).toEqual([]);
    expect(publicMedia).toEqual([]);

    await page.getByLabel('Size *').fill('OS');
    await page.getByLabel('Asking price (MZN) *').fill('1234.50');
    await page.getByRole('button', { name: 'Add inventory draft' }).click();
    await expect(page.getByRole('status')).toContainText('Inventory draft saved');
    const { data: stock, error: stockError } = await admin
      .from('listings')
      .select(
        'id, variant_id, status, ownership_type, seller_id, quantity, condition, asking_price, currency, authentication_status, published_at'
      )
      .eq('product_id', productId)
      .single();
    if (stockError || !stock) throw stockError ?? new Error('Inventory draft missing');
    expect(stock).toMatchObject({
      status: 'DRAFT',
      ownership_type: 'STREET_CULTURE',
      seller_id: null,
      quantity: 1,
      condition: 'NEW',
      asking_price: 1234.5,
      currency: 'MZN',
      authentication_status: 'PENDING',
      published_at: null,
    });
    const { data: variant } = await admin
      .from('product_variants')
      .select('size, size_system')
      .eq('id', stock.variant_id)
      .single();
    expect(variant).toEqual({ size: 'OS', size_system: 'STANDARD' });
    const { data: publicStock } = await anon
      .from('public_catalog_listings')
      .select('listing_id')
      .eq('listing_id', stock.id);
    expect(publicStock).toEqual([]);
    const { error: unauthorizedRpc } = await anon.rpc('create_staff_inventory_draft', {
      target_product_id: productId,
      target_size: 'OS',
      target_size_system: 'STANDARD',
      target_condition: 'NEW',
      target_asking_price: 1234.5,
    });
    expect(unauthorizedRpc).not.toBeNull();

    await page
      .getByLabel('Item-level authentication note (optional)')
      .fill('Browser QA verified exact physical item, price and photo rights.');
    await page.getByLabel(/Confirmed: Physical item inspected/).check();
    await page.getByRole('button', { name: 'Authenticate & publish' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Listing is live and visible to shoppers.'
    );
    const { data: publishedProduct } = await admin
      .from('products')
      .select('active,slug')
      .eq('id', productId)
      .single();
    expect(publishedProduct?.active).toBe(true);
    const { data: anonymousCatalog } = await anon
      .from('public_catalog_products')
      .select('product_id,listing_options')
      .eq('product_id', productId);
    expect(anonymousCatalog).toHaveLength(1);
    const shopperContext = await browser.newContext();
    const shopper = await shopperContext.newPage();
    await shopper.goto('/shop');
    await expect(shopper.getByRole('link', { name, exact: true })).toBeVisible();
    await shopper.goto(`/products/${publishedProduct!.slug}`);
    await expect(shopper.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
    await shopper.getByRole('button', { name: 'Add to bag' }).click();
    await expect(shopper.getByRole('dialog', { name: 'Your bag · 1' })).toBeVisible();
    await shopperContext.close();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByRole('status')).toContainText('Listing unpublished.');
    const { data: unpublishedProduct } = await admin
      .from('products')
      .select('active')
      .eq('id', productId)
      .single();
    expect(unpublishedProduct?.active).toBe(false);

    await page.goto(`/admin/products/${productId}?tab=general`);
    await page.getByLabel('Description').fill('Updated draft description verified in browser QA.');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Draft saved. It is still hidden from shoppers.'
    );

    await page.goto(`/admin/products/${productId}?tab=variants`);
    await page.getByText('Generate size range').click();
    await page.getByLabel('From').fill('8');
    await page.getByLabel('Through').fill('9');
    await page.getByRole('button', { name: 'Generate variants' }).click();
    await expect(page.getByRole('status')).toContainText(
      '3 variants created. No physical units were added.'
    );

    await page.goto(`/admin/products/${productId}?tab=media`);
    await page.getByLabel('Photo 1 description').fill('Updated browser QA photo alt text');
    await page.getByRole('button', { name: 'Save alt' }).click();
    await expect(page.getByRole('status')).toContainText('Photos updated.');

    const exportCheck = await page.evaluate(async (id) => {
      const response = await fetch(`/api/admin/products/export?ids=${id}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { status: response.status, magic: String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0) };
    }, productId);
    expect(exportCheck).toEqual({ status: 200, magic: 'PK' });
  } finally {
    await admin.from('authentication_records').delete().eq('authenticator_id', userId);
    const { data: product } = await admin
      .from('products')
      .select('id, product_media(storage_path)')
      .eq('name', name)
      .maybeSingle();
    if (product) {
      const paths = product.product_media
        .map((item) => item.storage_path)
        .filter((path) => !path.startsWith('/'));
      await admin.from('products').delete().eq('id', product.id);
      if (paths.length) await admin.storage.from('product-images').remove(paths);
    }
    await admin.from('admin_audit_logs').delete().in('actor_id', [userId, customerId, staffId]);
    await admin.auth.admin.deleteUser(userId);
    await admin.auth.admin.deleteUser(customerId);
    await admin.auth.admin.deleteUser(staffId);
  }
});
