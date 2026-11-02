// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  gateway: vi.fn(),
  dispatch: vi.fn(),
  token: 'owned-token',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (mocks.token ? { value: mocks.token } : undefined) }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/lib/payments/guest-checkout', () => ({
  consumeGuestCheckoutRateLimit: async () => true,
  guestOrderCookieName: () => 'test',
  hashGuestOrderToken: () => 'owned-hash',
}));
vi.mock('@/lib/payments/gateways', () => ({
  MpesaGateway: class {
    getPayment = mocks.gateway;
  },
}));
vi.mock('@/lib/notifications/service', () => ({
  notificationProvider: { dispatch: mocks.dispatch },
}));
import { POST } from '@/app/api/payments/mpesa/status/route';
import { PaymentStatusUnavailableError } from '@/lib/payments/types';
const orderId = '11111111-1111-4111-8111-111111111111';
const paymentId = '22222222-2222-4222-8222-222222222222';
let ownedOrder: object | null, payment: Record<string, unknown> | null;
let orderQuery: ReturnType<typeof builder>, paymentQuery: ReturnType<typeof builder>;
function builder(result: () => unknown) {
  const query = {
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: result(), error: null })),
  };
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token = 'owned-token';
  ownedOrder = {
    id: orderId,
    order_number: 'SCOUTAGE',
    status: 'PENDING',
    payment_status: 'UNPAID',
    total_amount: 84515.72,
  };
  payment = {
    id: paymentId,
    status: 'PENDING',
    provider_reference: 'ST1234ABCD',
    provider_payload: {},
  };
  orderQuery = builder(() => ownedOrder);
  paymentQuery = builder(() => payment);
  mocks.from.mockImplementation((table) => ({
    select: (columns: string) =>
      table === 'orders'
        ? orderQuery
        : columns === 'amount, status'
          ? {
              eq: () => ({
                eq: async () => ({ data: [{ amount: 75000, status: 'SUCCEEDED' }], error: null }),
              }),
            }
          : paymentQuery,
  }));
  mocks.gateway.mockResolvedValue({ status: 'PROCESSING' });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
});
afterEach(() => vi.unstubAllEnvs());
const submit = (withId = true) =>
  POST(
    new Request('https://www.streetculturevault.com/api/payments/mpesa/status', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, ...(withId ? { payment_id: paymentId } : {}) }),
    })
  );
describe('M-Pesa status-only recovery', () => {
  it('requires checkout ownership even when recovering without a payment ID', async () => {
    mocks.token = '';
    expect((await submit(false)).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it('rejects a different order owner before looking up payments', async () => {
    ownedOrder = null;
    expect((await submit()).status).toBe(404);
    expect(mocks.gateway).not.toHaveBeenCalled();
    expect(orderQuery.eq).toHaveBeenCalledWith('guest_access_token_hash', 'owned-hash');
  });
  it('can query the existing reference without an ID or an unexpired reservation; never initiates', async () => {
    const response = await submit(false);
    expect(response.status).toBe(202);
    expect(paymentQuery.eq).toHaveBeenCalledWith('order_id', orderId);
    expect(paymentQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mocks.gateway).toHaveBeenCalledWith('ST1234ABCD');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('reports a provider outage as an unknown outcome, not a decline or paid order', async () => {
    mocks.gateway.mockRejectedValue(new PaymentStatusUnavailableError());
    const response = await submit();
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: 'PROCESSING', reason: 'PROVIDER_UNAVAILABLE' });
    expect(body.message).toContain('do not pay again');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('does not create a payment when an uncertain initiation has no record yet', async () => {
    payment = null;
    const response = await submit(false);
    expect((await response.json()).reason).toBe('PAYMENT_RECORD_PENDING');
    expect(mocks.gateway).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('only advances to the exact remaining installment after provider confirmation', async () => {
    mocks.gateway.mockResolvedValue({ status: 'PAID' });
    const response = await submit();
    expect(await response.json()).toMatchObject({
      status: 'PARTIALLY_PAID',
      paidAmount: 75000,
      remainingAmount: 9515.72,
      nextInstallmentAmount: 9515.72,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('complete_guest_checkout_payment', {
      target_payment_id: paymentId,
    });
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
