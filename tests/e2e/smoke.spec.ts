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

async function reachReview(page: Page) {
  await page.route('**/api/checkout/shipping', async (route) => {
    await route.fulfill({ json: { methods: [{
      id: 'a1000000-0000-4000-8000-000000000003', code: 'TEST_MAPUTO',
      name: 'Test Maputo delivery', price: 125, currency: 'MZN',
      estimated_min_days: 1, estimated_max_days: 3,
    }] } });
  });
  await addFirstLivePiece(page);
  await page.getByRole('dialog', { name: 'Your bag · 1' }).getByRole('button', { name: /Checkout/ }).click();
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await checkout.getByLabel('Full name').fill('Test Buyer');
  await checkout.getByLabel('Email').fill('buyer@example.invalid');
  await checkout.getByLabel('Phone').fill('841234567');
  await checkout.getByRole('button', { name: 'Continue' }).click();
  await checkout.getByLabel('Address line 1').fill('Rua Teste 12');
  await expect(checkout.getByText('Test Maputo delivery')).toBeVisible();
  await checkout.getByRole('button', { name: 'Continue' }).click();
  await expect(checkout.getByText('M-Pesa', { exact: true })).toBeVisible();
  await checkout.getByRole('button', { name: 'Continue' }).click();
  await expect(checkout.getByText('Ready when you are.')).toBeVisible();
}

test('homepage uses the supplied brand mark and lists real live inventory', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Street Culture — Authentic Only' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /AUTHENTICITY/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Most Wanted products' }).locator('article')).toHaveCount(7);
});

test('a guest wishlist persists locally across a reload', async ({ page }) => {
  const wishlistLoaded = page.waitForResponse((response) =>
    response.url().endsWith('/api/wishlist') && response.request().method() === 'GET');
  await page.goto('/');
  await wishlistLoaded;
  const carousel = page.getByRole('region', { name: 'Most Wanted products' });
  const firstPiece = carousel.locator('article').first();
  const addButton = firstPiece.getByRole('button', { name: /Add .* to wishlist/ });
  await addButton.click();
  await expect(firstPiece.getByRole('button', { name: /Remove .* from wishlist/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Most Wanted products' })
    .locator('article').first().getByRole('button', { name: /Remove .* from wishlist/ })).toBeVisible();
});

test('Most Wanted quick buy adds the selected listing to the bag', async ({ page }) => {
  await addFirstLivePiece(page);
  await expect(page.getByRole('dialog', { name: 'Your bag · 1' }).getByText('One-of-one · Qty 1')).toBeVisible();
});

test('search and category pages query the live catalog', async ({ page }) => {
  await page.goto('/search?q=Jordan');
  await expect(page.getByText("Air Jordan 1 Retro High OG 'Chicago Lost & Found'").first()).toBeVisible();
  await page.goto('/sneakers');
  await expect(page.getByRole('heading', { name: 'SNEAKERS' })).toBeVisible();
  await expect(page.locator('article').first()).toBeVisible();
});

test('mocked M-Pesa confirmation shows the order summary without contacting MineScope', async ({ page }) => {
  await page.route('**/api/checkout/orders', (route) => route.fulfill({ json: {
    orderId, orderNumber: 'SC1234ABCD', subtotal: 2840, shipping: 125, total: 2965,
  } }));
  await page.route('**/api/payments/mpesa/initiate', (route) => route.fulfill({ status: 202, json: {
    orderId, orderNumber: 'SC1234ABCD', paymentId, status: 'PENDING',
  } }));
  await page.route('**/api/payments/*/status?*', (route) => route.fulfill({ json: {
    status: 'PAID', orderStatus: 'CONFIRMED', orderNumber: 'SC1234ABCD', fulfillable: true,
  } }));
  await reachReview(page);
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await checkout.getByRole('button', { name: 'Continue with M-Pesa' }).click();
  await expect(checkout.getByRole('heading', { name: 'Order confirmed.' })).toBeVisible();
  await expect(checkout.getByText('SC1234ABCD')).toBeVisible();
  await expect(checkout.getByRole('link', { name: 'Track order' })).toHaveAttribute('href', '/order/SC1234ABCD');
});

test('mocked declined payment leaves the customer in checkout with a clear retry', async ({ page }) => {
  await page.route('**/api/checkout/orders', (route) => route.fulfill({ json: {
    orderId, orderNumber: 'SC1234ABCD', subtotal: 2840, shipping: 125, total: 2965,
  } }));
  await page.route('**/api/payments/mpesa/initiate', (route) => route.fulfill({ status: 202, json: {
    orderId, orderNumber: 'SC1234ABCD', paymentId, status: 'PENDING',
  } }));
  await page.route('**/api/payments/*/status?*', (route) => route.fulfill({ json: {
    status: 'FAILED', orderStatus: 'CANCELLED', orderNumber: 'SC1234ABCD',
  } }));
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
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('430px guest checkout keeps address and M-Pesa review usable', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 844 });
  await reachReview(page);
  const checkout = page.getByRole('dialog', { name: 'Secure checkout' });
  await expect(checkout.getByText('Test Maputo delivery')).toBeVisible();
  await expect(checkout.getByRole('button', { name: 'Continue with M-Pesa' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('sign-in, sign-up, consignment and health routes remain available', async ({ page, request }) => {
  await page.goto('/auth/sign-in');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await page.goto('/auth/sign-up');
  await expect(page.getByRole('heading', { name: 'CREATE AN ACCOUNT' })).toBeVisible();
  await page.goto('/consign');
  await expect(page.getByRole('link', { name: /Submit item for consignment/i }).first()).toBeVisible();
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
});

test('signed-in customer sees only their own order and consignment status', async ({ page, request }) => {
  const url = process.env.LOCAL_SUPABASE_TEST_URL;
  const key = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
  test.skip(!url || !key, 'Local Supabase test credentials are required.');
  const admin = createClient(url!, key!, { auth: { persistSession: false } });
  const email = `browser-buyer-${randomUUID()}@example.invalid`;
  const password = `Test-${randomBytes(12).toString('hex')}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) throw createError ?? new Error('Test user missing');
  const userId = created.user.id;
  const orderId = randomUUID();
  const submissionId = randomUUID();
  const orderNumber = `SC${randomBytes(4).toString('hex').toUpperCase()}`;
  try {
    const { error: profileError } = await admin.from('profiles').upsert({ id: userId, account_type: 'BOTH' });
    if (profileError) throw profileError;
    const { error: orderError } = await admin.from('orders').insert({
      id: orderId, user_id: userId, order_number: orderNumber,
      status: 'CONFIRMED', payment_status: 'PAID', fulfillment_status: 'UNFULFILLED',
      currency: 'MZN', subtotal: 1000, shipping_amount: 125, total_amount: 1125,
      shipping_address_snapshot: { address_line_1: 'Test street', city: 'Maputo', province: 'Maputo' },
      shipping_method_snapshot: { name: 'Test delivery' },
    });
    if (orderError) throw orderError;
    const { error: itemError } = await admin.from('order_items').insert({
      order_id: orderId, product_name_snapshot: 'Test verified piece',
      brand_name_snapshot: 'A/X', size_snapshot: '10.5', condition_snapshot: 'NEW',
      unit_price: 1000, quantity: 1,
    });
    if (itemError) throw itemError;
    const { error: submissionError } = await admin.from('consignment_submissions').insert({
      id: submissionId, seller_id: userId, brand_name: 'A/X', product_name: 'Test sold consignment',
      size: '10.5', condition: 'NEW', expected_price: 1000, currency: 'MZN', status: 'SOLD',
    });
    if (submissionError) throw submissionError;

    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.endsWith('-auth-token'))).toBe(true);
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

test('staff can create an unpublished catalog draft with a photo', async ({ page, request }) => {
  const url = process.env.LOCAL_SUPABASE_TEST_URL;
  const serviceKey = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
  const anonKey = process.env.LOCAL_SUPABASE_TEST_ANON_KEY;
  test.skip(!url || !serviceKey || !anonKey, 'Local Supabase test credentials are required.');
  const denied = await request.post('/api/admin/products', { data: {} });
  expect(denied.status()).toBe(401);

  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const email = `catalog-staff-${randomUUID()}@example.invalid`;
  const password = `Test-${randomBytes(12).toString('hex')}`;
  const customerEmail = `catalog-customer-${randomUUID()}@example.invalid`;
  const name = `Catalog draft ${randomUUID()}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) throw createError ?? new Error('Staff user missing');
  const userId = created.user.id;
  const { data: customer, error: customerError } = await admin.auth.admin.createUser({ email: customerEmail, password, email_confirm: true });
  if (customerError || !customer.user) throw customerError ?? new Error('Customer user missing');
  const customerId = customer.user.id;
  let productId: string | null = null;
  try {
    const { error: roleError } = await admin.from('user_roles').insert({ user_id: userId, role: 'STAFF' });
    if (roleError) throw roleError;
    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill(customerEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.endsWith('-auth-token'))).toBe(true);
    await page.waitForURL('**/account');
    const customerPosts = await page.evaluate(async () => {
      const productResponse = await fetch('/api/admin/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const listingResponse = await fetch('/api/admin/products/00000000-0000-4000-8000-000000000001/listings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      return [productResponse.status, listingResponse.status];
    });
    expect(customerPosts).toEqual([403, 403]);
    await page.goto('/admin/products/new');
    await expect(page.getByText('This page could not be found.')).toBeVisible();

    await page.goto('/auth/sign-in');
    await page.getByLabel('Email Address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.endsWith('-auth-token'))).toBe(true);
    await page.waitForURL('**/account');
    await expect(page.getByRole('link', { name: /STAFF PANEL/ })).toBeVisible();
    await page.goto('/admin/products/new');
    await expect(page.getByRole('heading', { name: 'NEW PRODUCT.' })).toBeVisible();
    await page.getByLabel('Product name *').fill(name);
    await page.getByLabel('Brand *').selectOption({ label: 'Nike' });
    await page.getByLabel('Category *').selectOption({ label: 'Sneakers' });
    await page.getByLabel('Product photos').setInputFiles({
      name: 'test-draft.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64'),
    });
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByRole('heading', { name: 'EDIT DRAFT.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible();
    const { data: product, error: productError } = await admin.from('products')
      .select('id, active, currency, product_media(storage_path), listings(id)').eq('name', name).single();
    if (productError || !product) throw productError ?? new Error('Draft product missing');
    productId = product.id;
    await page.goto('/admin/products');
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByRole('img', { name: `${name} concept image` })).toBeVisible();
    await page.goto(`/admin/products/${productId}`);
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
    const { data: stock, error: stockError } = await admin.from('listings')
      .select('id, variant_id, status, ownership_type, seller_id, quantity, condition, asking_price, currency, authentication_status, published_at')
      .eq('product_id', productId).single();
    if (stockError || !stock) throw stockError ?? new Error('Inventory draft missing');
    expect(stock).toMatchObject({
      status: 'DRAFT', ownership_type: 'STREET_CULTURE', seller_id: null,
      quantity: 1, condition: 'NEW', asking_price: 1234.5,
      currency: 'MZN', authentication_status: 'PENDING', published_at: null,
    });
    const { data: variant } = await admin.from('product_variants')
      .select('size, size_system').eq('id', stock.variant_id).single();
    expect(variant).toEqual({ size: 'OS', size_system: 'STANDARD' });
    const { data: publicStock } = await anon.from('public_catalog_listings')
      .select('listing_id').eq('listing_id', stock.id);
    expect(publicStock).toEqual([]);
    const { error: unauthorizedRpc } = await anon.rpc('create_staff_inventory_draft', {
      target_product_id: productId, target_size: 'OS', target_size_system: 'STANDARD',
      target_condition: 'NEW', target_asking_price: 1234.5,
    });
    expect(unauthorizedRpc).not.toBeNull();
  } finally {
    const { data: product } = await admin.from('products').select('id, product_media(storage_path)').eq('name', name).maybeSingle();
    if (product) {
      const paths = product.product_media.map((item) => item.storage_path).filter((path) => !path.startsWith('/'));
      if (paths.length) await admin.storage.from('product-images').remove(paths);
      await admin.from('products').delete().eq('id', product.id);
    }
    await admin.auth.admin.deleteUser(userId);
    await admin.auth.admin.deleteUser(customerId);
  }
});
