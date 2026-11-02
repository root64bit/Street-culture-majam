// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  gateway: vi.fn(),
  token: 'synthetic-checkout-token',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (mocks.token ? { value: mocks.token } : undefined) }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/payments/guest-checkout', () => ({
  consumeGuestCheckoutRateLimit: async () => true,
  guestOrderCookieName: () => 'test-cookie',
  hashGuestOrderToken: () => 'test-token-hash',
}));
vi.mock('@/lib/payments/gateways', () => ({
  MpesaGateway: class {
    createPayment = mocks.gateway;
  },
}));
import { POST } from '@/app/api/payments/mpesa/initiate/route';
const id = '11111111-1111-4111-8111-111111111111';
let order: Record<string, unknown> | null;
let previous: Record<string, unknown>[];
let orderQuery: { eq: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> };
let paymentQuery: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'true');
  mocks.token = 'synthetic-checkout-token';
  order = {
    id,
    order_number: 'SCTEST',
    status: 'PENDING',
    payment_status: 'UNPAID',
    total_amount: 80000,
    currency: 'MZN',
    guest_phone: '+27110000000',
    payment_expires_at: new Date(Date.now() + 600000).toISOString(),
  };
  previous = [];
  orderQuery = {
    eq: vi.fn(() => orderQuery),
    maybeSingle: vi.fn(async () => ({ data: order, error: null })),
  };
  paymentQuery = {
    select: vi.fn(() => paymentQuery),
    eq: vi.fn(() => paymentQuery),
    order: vi.fn(async () => ({ data: previous, error: null })),
    insert: vi.fn(() => paymentQuery),
    single: vi.fn(async () => ({
      data: { id: 'test-payment', idempotency_key: 'synthetic-key' },
      error: null,
    })),
    update: vi.fn(() => paymentQuery),
  };
  mocks.from.mockImplementation((table) =>
    table === 'orders' ? { select: () => orderQuery } : paymentQuery
  );
  mocks.gateway.mockResolvedValue({ providerReference: 'synthetic-provider-reference' });
});
afterEach(() => vi.unstubAllEnvs());
const submit = (phone = '+258841234567') =>
  POST(
    new Request('https://www.streetculturevault.com/api/payments/mpesa/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: id, phone }),
    })
  );
describe('M-Pesa payer is independent of the international delivery contact', () => {
  it('allows a Mozambique wallet on an owned checkout with a South African contact and caps the installment', async () => {
    const result = await submit();
    expect(result.status).toBe(202);
    expect(orderQuery.eq).toHaveBeenCalledWith('guest_access_token_hash', 'test-token-hash');
    expect(mocks.gateway).toHaveBeenCalledWith(
      expect.objectContaining({ customerPhone: '258841234567', amountMinor: 7500000 })
    );
    expect(paymentQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_payload: expect.objectContaining({ payerPhone: '258841234567' }),
        amount: 75000,
      })
    );
    expect(order!.guest_phone).toBe('+27110000000');
  });
  it('requires the checkout cookie before accessing an order or calling the provider', async () => {
    mocks.token = '';
    expect((await submit()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it('rejects an order not owned by the checkout token', async () => {
    order = null;
    expect((await submit()).status).toBe(404);
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it('rejects an international non-M-Pesa number before database access', async () => {
    expect((await submit('+27110000000')).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('keeps fractional totals exact and never calls the provider', async () => {
    order!.total_amount = 627.85;
    expect((await submit()).status).toBe(422);
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it('returns an existing pending request without sending another push', async () => {
    previous = [
      {
        id: 'existing',
        status: 'REQUIRES_ACTION',
        amount: 75000,
        provider_payload: { payerPhone: '258841234567' },
      },
    ];
    expect((await submit()).status).toBe(202);
    expect(paymentQuery.insert).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it('does not change the payer on an in-progress order', async () => {
    previous = [
      {
        id: 'existing',
        status: 'SUCCEEDED',
        amount: 75000,
        provider_payload: { payerPhone: '258851234567' },
      },
    ];
    expect((await submit()).status).toBe(400);
    expect(paymentQuery.insert).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it('preserves legacy installment bindings and normalizes +258 phone formatting', async () => {
    order!.guest_phone = '+258841234567';
    previous = [{ id: 'legacy', status: 'SUCCEEDED', amount: 75000, provider_payload: {} }];
    expect((await submit('841234567')).status).toBe(202);
    expect(mocks.gateway).toHaveBeenCalledWith(
      expect.objectContaining({ customerPhone: '258841234567', amountMinor: 500000 })
    );
  });
});
