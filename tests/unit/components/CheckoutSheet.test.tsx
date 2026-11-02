import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutSheet } from '@/components/commerce/CommerceOverlays';

const state = vi.hoisted(() => ({ commerce: {} as Record<string, unknown> }));
// Keep legacy form behavior testable with no provider access. A separate real-
// policy component test proves retired gateways cannot appear in checkout.
vi.mock('@/lib/payments/provider-policy', () => ({ paymentProviderAllowed: () => true }));
vi.mock('@/features/commerce/CommerceProvider', () => ({ useCommerce: () => state.commerce }));
vi.mock('next/image', () => ({ default: () => <span data-testid="product-image" /> }));
vi.mock('@/features/currency/CurrencyProvider', () => ({
  DisplayPrice: ({ amount }: { amount: number }) => <span>{amount}</span>,
}));
vi.mock('@/components/payments/SquarePaymentForm', () => ({
  SquarePaymentForm: () => <div>Secure card form</div>,
}));

let fetchMock: ReturnType<typeof vi.fn>;
let methods: object[];
const line = {
  listingId: 'listing-1',
  size: 'OS',
  quantity: 1,
  product: { id: 'listing-1', name: 'Prada Symbole Sunglasses', price: 78, image: '/test.jpg' },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.stubEnv('NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED', 'true');
  methods = [
    {
      quoteId: 'quote-1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      code: 'TEST',
      name: 'Store delivery',
      price: 125,
      source: 'configured',
      estimated_min_days: 1,
      estimated_max_days: 3,
    },
  ];
  fetchMock = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(url === '/api/account/checkout' ? { signedIn: false } : { methods }),
        { status: 200 }
      )
  );
  vi.stubGlobal('fetch', fetchMock);
  state.commerce = {
    cart: [line],
    subtotal: 78,
    checkoutOpen: true,
    closeCheckout: vi.fn(),
    clearCart: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function enterDelivery() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Buyer' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.invalid' } });
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+258841234567' } });
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
  fireEvent.change(screen.getByLabelText('Address line 1'), {
    target: { value: '132 Queens Road' },
  });
  fireEvent.change(screen.getByLabelText('Suburb / local area'), { target: { value: 'Mayfair' } });
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '2092' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650);
  });
  if (methods.length)
    expect(screen.getByText('Store-approved delivery or pickup price in MZN.')).toBeInTheDocument();
}
async function enterReview() {
  await enterDelivery();
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
  expect(screen.getByText('Choose how to pay.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
}

async function paymentForDestination(country: string) {
  render(<CheckoutSheet />);
  await enterDelivery();
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: country } });
  if (country === 'ZA') {
    fireEvent.change(screen.getByLabelText('Province'), { target: { value: 'Gauteng' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Johannesburg' } });
  } else
    fireEvent.change(screen.getByLabelText('Province'), {
      target: { value: country === 'GB' ? 'London' : 'Maputo' },
    });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650);
  });
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
  expect(screen.getByText('Choose how to pay.')).toBeInTheDocument();
}

describe('M-Pesa independent of delivery destination', () => {
  it.each(['ZA', 'GB', 'MZ'])(
    'offers M-Pesa for %s deliveries without starting a payment',
    async (country) => {
      await paymentForDestination(country);
      const option = screen.getByRole('button', { name: /^M-Pesa Mozambique/ });
      expect(option).toBeEnabled();
      fireEvent.click(option);
      expect(screen.getByLabelText('M-Pesa wallet number')).toHaveValue('+258841234567');
      fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
      expect(screen.getByText('Ready when you are.')).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.every(([url]) =>
          ['/api/account/checkout', '/api/checkout/shipping'].includes(url)
        )
      ).toBe(true);
    }
  );
  it('offers M-Pesa for exact centavo totals on South African deliveries', async () => {
    methods = [{ ...methods[0], price: 549.85 }];
    await paymentForDestination('ZA');
    expect(screen.getByRole('button', { name: /^M-Pesa Mozambique/ })).toBeEnabled();
    expect(screen.queryByText(/This total includes centavos/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Card / })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Apple Pay / })).toBeEnabled();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/payments/'))).toBe(false);
  });
  it('rejects non-Mozambique numbers before reserving an order or sending a prompt', async () => {
    await paymentForDestination('ZA');
    fireEvent.click(screen.getByRole('button', { name: /^M-Pesa Mozambique/ }));
    fireEvent.change(screen.getByLabelText('M-Pesa wallet number'), {
      target: { value: '+27110000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Mozambique M-Pesa number');
    expect(screen.queryByText('Ready when you are.')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === '/api/checkout/orders' || url.includes('/api/payments/')
      )
    ).toBe(false);
  });
  it('keeps an international delivery contact separate from the Mozambique payer', async () => {
    fetchMock.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === '/api/account/checkout'
              ? { signedIn: false }
              : url === '/api/checkout/orders'
                ? { error: 'Stop before any payment.' }
                : { methods }
          ),
          { status: url === '/api/checkout/orders' ? 409 : 200 }
        )
    );
    await paymentForDestination('ZA');
    fireEvent.click(screen.getByRole('button', { name: 'Previous checkout step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous checkout step' }));
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+27110000000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    fireEvent.click(screen.getByRole('button', { name: /^M-Pesa Mozambique/ }));
    fireEvent.change(screen.getByLabelText('M-Pesa wallet number'), {
      target: { value: '+258851234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue with M-Pesa' }));
    });
    const orders = fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/orders');
    expect(orders).toHaveLength(1);
    expect(JSON.parse(orders[0][1].body)).toMatchObject({ phone: '+27110000000', country: 'ZA' });
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/payments/mpesa/initiate')).toBe(
      false
    );
  });
  it('respects the disabled deployment flag for every destination', async () => {
    vi.stubEnv('NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED', 'false');
    await paymentForDestination('ZA');
    expect(screen.getByRole('button', { name: /^M-Pesa / })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Card / })).toBeEnabled();
  });
});

describe('Square disconnected while PayFast verification is pending', () => {
  it('removes card and Apple Pay and defaults an eligible international delivery to M-Pesa', async () => {
    vi.stubEnv('NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED', 'false');
    await paymentForDestination('ZA');
    expect(screen.queryByRole('button', { name: /^Card / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apple Pay / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^M-Pesa Mozambique/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('M-Pesa wallet number')).toHaveValue('+258841234567');
    expect(
      screen.getByText(/Card and wallet payments are temporarily unavailable/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getByText('Ready when you are.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/payments/'))).toBe(false);
  });
  it('allows fractional M-Pesa checkout without rounding or needing the disconnected gateway', async () => {
    vi.stubEnv('NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED', 'false');
    methods = [{ ...methods[0], price: 549.85 }];
    await paymentForDestination('ZA');
    expect(screen.getByRole('button', { name: /^M-Pesa Mozambique/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Continue/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getByText('Ready when you are.')).toBeInTheDocument();
    expect(screen.getAllByText('MZN 627.85').length).toBeGreaterThan(0);
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === '/api/checkout/orders' || url.includes('/api/payments/')
      )
    ).toBe(false);
  });
  it('does not let checkout advance when no payment method is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED', 'false');
    vi.stubEnv('NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED', 'false');
    await paymentForDestination('GB');
    expect(screen.getByRole('button', { name: /^M-Pesa / })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Card / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
    expect(screen.queryByText('Secure card form')).not.toBeInTheDocument();
  });
});

describe('M-Pesa outage recovery never sends another push', () => {
  function mockPaymentFlow(loseInitiation = false) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/account/checkout') return new Response(JSON.stringify({ signedIn: false }));
      if (url === '/api/checkout/orders')
        return new Response(
          JSON.stringify({ orderId: 'reserved-order', orderNumber: 'SCOUTAGE', total: 203 })
        );
      if (url === '/api/payments/mpesa/initiate') {
        if (loseInitiation) throw new Error('Response lost after request');
        return new Response(
          JSON.stringify({
            paymentId: 'existing-payment',
            orderNumber: 'SCOUTAGE',
            status: 'PROCESSING',
            paidAmount: 0,
            remainingAmount: 203,
            nextInstallmentAmount: 203,
            installmentAmount: 203,
            installmentNumber: 1,
            installmentCount: 1,
          }),
          { status: 202 }
        );
      }
      if (url === '/api/payments/mpesa/status')
        return new Response(
          JSON.stringify({
            status: 'PROCESSING',
            reason: 'PROVIDER_UNAVAILABLE',
            message: 'M-Pesa confirmation service is unavailable. Do not pay again.',
          }),
          { status: 202 }
        );
      return new Response(JSON.stringify({ methods }));
    });
  }
  it('shows one clear outage notice and checks only the existing payment even after reservation expiry', async () => {
    mockPaymentFlow();
    render(<CheckoutSheet />);
    await enterReview();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue with M-Pesa' }));
    });
    expect(screen.getByText('Payment not yet confirmed')).toBeInTheDocument();
    expect(screen.getByText('Order reference: SCOUTAGE')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16 * 60 * 1000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
    });
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/payments/mpesa/initiate')
    ).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/orders')).toHaveLength(1);
    const checks = fetchMock.mock.calls.filter(([url]) => url === '/api/payments/mpesa/status');
    expect(checks).toHaveLength(2);
    expect(JSON.parse(checks[1][1].body)).toEqual({
      order_id: 'reserved-order',
      payment_id: 'existing-payment',
    });
  });
  it('recovers a lost initiation response by order, without initiating another payment', async () => {
    mockPaymentFlow(true);
    render(<CheckoutSheet />);
    await enterReview();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue with M-Pesa' }));
    });
    expect(screen.getByText('Payment not yet confirmed')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
    });
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/payments/mpesa/initiate')
    ).toHaveLength(1);
    const checks = fetchMock.mock.calls.filter(([url]) => url === '/api/payments/mpesa/status');
    expect(JSON.parse(checks[0][1].body)).toEqual({ order_id: 'reserved-order' });
    expect(screen.queryByText('Order confirmed.')).not.toBeInTheDocument();
  });
});

describe('checkout delivery recovery', () => {
  const savedDetails = {
    name: 'Account Buyer',
    email: 'account@example.invalid',
    phone: '+27110000000',
    country: 'ZA',
    address_line_1: 'Saved Example 1',
    address_line_2: 'Unit 2',
    local_area: 'Mayfair',
    city: 'Johannesburg',
    province: 'Gauteng',
    postal_code: '2092',
    address_type: 'residential',
    delivery_notes: '',
  };
  const saved = {
    id: '11111111-1111-4111-8111-111111111111',
    label: 'Home',
    is_default: true,
    revision: 1,
    details: savedDetails,
  };
  const identity = {
    signedIn: true,
    userId: 'test-user',
    contact: { name: 'Account Buyer', email: 'account@example.invalid', phone: '+27110000000' },
    addresses: [
      saved,
      {
        ...saved,
        id: '22222222-2222-4222-8222-222222222222',
        label: 'Work',
        is_default: false,
        details: { ...savedDetails, address_line_1: 'Work Example 2' },
      },
    ],
  };
  it('prefills signed-in contact details and refreshes quotes when a saved address changes', async () => {
    fetchMock.mockImplementation(
      async (url: string) =>
        new Response(JSON.stringify(url === '/api/account/checkout' ? identity : { methods }))
    );
    await act(async () => {
      render(<CheckoutSheet />);
    });
    expect(screen.getByLabelText('Full name')).toHaveValue('Account Buyer');
    expect(screen.getByLabelText('Email')).toHaveValue('account@example.invalid');
    expect(screen.getByText('Your checkout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(screen.getByLabelText('Address line 1')).toHaveValue('Saved Example 1');
    expect(screen.getByLabelText(/Save this address.*for future checkouts/)).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Saved delivery address'), {
      target: { value: identity.addresses[1].id },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    const requests = fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/shipping');
    expect(JSON.parse(requests.at(-1)![1].body).address_line_1).toBe('Work Example 2');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/account/addresses')).toBe(false);
  });
  it('does not overwrite a name typed while account details are loading', async () => {
    let resolveIdentity!: (value: Response) => void;
    fetchMock.mockImplementation((url: string) =>
      url === '/api/account/checkout'
        ? new Promise<Response>((resolve) => {
            resolveIdentity = resolve;
          })
        : Promise.resolve(new Response(JSON.stringify({ methods })))
    );
    render(<CheckoutSheet />);
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Different recipient' },
    });
    await act(async () => {
      resolveIdentity(new Response(JSON.stringify(identity)));
    });
    expect(screen.getByLabelText('Full name')).toHaveValue('Different recipient');
    expect(screen.getByLabelText('Email')).toHaveValue('account@example.invalid');
  });
  it('saves delivery contact details only after explicit opt-in', async () => {
    fetchMock.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === '/api/account/checkout'
              ? identity
              : url === '/api/account/addresses'
                ? { address: { ...saved, revision: 2 } }
                : { methods }
          )
        )
    );
    await act(async () => {
      render(<CheckoutSheet />);
    });
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    fireEvent.click(screen.getByLabelText(/Save this address.*for future checkouts/));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    });
    const writes = fetchMock.mock.calls.filter(([url]) => url === '/api/account/addresses');
    expect(writes).toHaveLength(1);
    const payload = JSON.parse(writes[0][1].body);
    expect(payload).toMatchObject({
      operation: 'SAVE',
      id: saved.id,
      revision: 1,
      details: { email: 'account@example.invalid', address_line_1: 'Saved Example 1' },
    });
    expect(payload).not.toHaveProperty('user_id');
    expect(screen.getByText('Choose how to pay.')).toBeInTheDocument();
  });
  it('preserves the selected delivery when advancing to review (screenshot regression)', async () => {
    render(<CheckoutSheet />);
    await enterReview();
    expect(screen.getByText('Ready when you are.')).toBeInTheDocument();
    expect(screen.getByText(/Store delivery ·/)).toBeInTheDocument();
    expect(screen.getByText('MZN 203')).toBeInTheDocument();
    expect(screen.queryByText('MZN 0')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/checkout/shipping')).toHaveLength(
      1
    );
  });

  it('returns to delivery and refreshes an expired quote without starting payment', async () => {
    render(<CheckoutSheet />);
    await enterReview();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_001);
    });
    expect(screen.queryByText('Ready when you are.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('missing, changed or expired');
    methods = [
      {
        ...methods[0],
        quoteId: 'quote-2',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      },
    ];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh delivery options' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(screen.getByText('Store delivery')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.every(
        ([url]) => url === '/api/checkout/shipping' || url === '/api/account/checkout'
      )
    ).toBe(true);
  });

  it('does not reuse a quote after the cart changes on review', async () => {
    const { rerender } = render(<CheckoutSheet />);
    await enterReview();
    state.commerce = {
      ...state.commerce,
      cart: [{ ...line, product: { ...line.product, price: 79 } }],
      subtotal: 79,
    };
    rerender(<CheckoutSheet />);
    expect(screen.queryByText('Ready when you are.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a fresh delivery option');
  });

  it('does not advance when the address has no service; refresh is available', async () => {
    methods = [];
    render(<CheckoutSheet />);
    await enterDelivery();
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an available delivery service');
    expect(screen.getByRole('button', { name: 'Refresh delivery options' })).toBeInTheDocument();
    expect(screen.queryByText('Ready when you are.')).not.toBeInTheDocument();
  });

  it('accepts a genuinely free configured quote, but not a missing quote', async () => {
    methods = [{ ...methods[0], price: 0 }];
    render(<CheckoutSheet />);
    await enterReview();
    expect(screen.getByText('Ready when you are.')).toBeInTheDocument();
    expect(screen.getByText('MZN 0')).toBeInTheDocument();
  });

  it('reopens an unreserved checkout at contact instead of a broken review screen', async () => {
    const { rerender } = render(<CheckoutSheet />);
    await enterReview();
    state.commerce = { ...state.commerce, checkoutOpen: false };
    rerender(<CheckoutSheet />);
    state.commerce = { ...state.commerce, checkoutOpen: true };
    rerender(<CheckoutSheet />);
    expect(screen.queryByText('Ready when you are.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('keeps a reserved order snapshot when the shopping bag later changes', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/checkout/orders')
        return new Response(
          JSON.stringify({ orderId: 'reserved-order', orderNumber: 'SCTEST', total: 203 })
        );
      if (url === '/api/payments/square/quote')
        return new Response(JSON.stringify({ error: 'Test provider disabled.' }), { status: 503 });
      return new Response(JSON.stringify({ methods }));
    });
    const { rerender } = render(<CheckoutSheet />);
    await enterDelivery();
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Card / }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Test provider disabled');
    state.commerce = {
      ...state.commerce,
      cart: [{ ...line, product: { ...line.product, name: 'Another product', price: 999 } }],
      subtotal: 999,
    };
    rerender(<CheckoutSheet />);
    expect(screen.getByText('Prada Symbole Sunglasses')).toBeInTheDocument();
    expect(screen.queryByText('Another product')).not.toBeInTheDocument();
    expect(screen.getByText('MZN 203')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit delivery' })).not.toBeInTheDocument();
  });
});
