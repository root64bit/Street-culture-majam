// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatSquareAmount, quoteMznInGbp } from '@/lib/payments/square-money';
import { createSquarePayment, findSquarePayment, SquareApiError } from '@/lib/payments/square';
import { PaymentOutcomeUnknownError } from '@/lib/payments/types';

describe('Square settlement amounts', () => {
  it('always displays the full pence amount before approval', () => {
    expect(formatSquareAmount(13.5)).toBe('£13.50');
    expect(formatSquareAmount(100)).toBe('£100.00');
  });
  it('converts MZN into integer GBP pence, including orders beyond the M-Pesa limit', () => {
    expect(quoteMznInGbp(150001, { GBP: 0.01234 })).toMatchObject({
      amountMinor: 185101,
      amount: 1851.01,
      currency: 'GBP',
    });
    expect(quoteMznInGbp(1125, { GBP: 0.012 })).toMatchObject({ amountMinor: 1350, amount: 13.5 });
  });
  it('rejects missing rates, invalid totals and amounts below one penny', () => {
    for (const value of [NaN, Infinity, 0, -1])
      expect(() => quoteMznInGbp(value, { GBP: 0.012 })).toThrow();
    expect(() => quoteMznInGbp(1000, {})).toThrow();
    expect(() => quoteMznInGbp(0.01, { GBP: 0.012 })).toThrow();
  });
});

describe('Square payment requests', () => {
  const fetchMock = vi.fn();
  const input = {
    sourceId: 'token-only-not-card-details',
    idempotencyKey: 'd52bfa34-04c6-4af9-b5b5-992ebbf8c359',
    paymentId: '45548e8f-9d66-4bf1-b70b-3ca0adb97f96',
    amountMinor: 1350,
    currency: 'GBP' as const,
    orderNumber: 'SCTEST',
    buyerEmail: 'buyer@example.invalid',
    buyerPhone: '258841234567',
    shippingAddress: { country: 'MZ' },
  };
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SQUARE_PAYMENTS_ENABLED', 'true');
    vi.stubEnv('SQUARE_ENVIRONMENT', 'production');
    vi.stubEnv('SQUARE_ACCESS_TOKEN', 'test-secret');
    vi.stubEnv('SQUARE_LOCATION_ID', 'test-location');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });
  it('sends the fixed pence amount and unique attempt reference to Square', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          payment: {
            id: 'square-payment-id',
            status: 'COMPLETED',
            amount_money: { amount: 1350, currency: 'GBP' },
          },
        }),
        { status: 200 }
      )
    );
    await createSquarePayment(input);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      amount_money: { amount: 1350, currency: 'GBP' },
      idempotency_key: input.idempotencyKey,
      reference_id: input.paymentId,
      buyer_phone_number: '+258841234567',
      source_id: input.sourceId,
      autocomplete: true,
    });
  });
  it('keeps timeouts and server errors uncertain rather than declaring a failed charge', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(createSquarePayment(input)).rejects.toBeInstanceOf(PaymentOutcomeUnknownError);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(createSquarePayment(input)).rejects.toBeInstanceOf(PaymentOutcomeUnknownError);
  });
  it('recognizes an explicit decline so a new attempt can be made', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ code: 'CARD_DECLINED' }] }), { status: 402 })
    );
    await expect(createSquarePayment(input)).rejects.toBeInstanceOf(SquareApiError);
  });
  it('recovers only the matching payment attempt after a lost response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          payments: [
            { id: 'old-attempt', reference_id: 'other-attempt', status: 'FAILED' },
            { id: 'matching-attempt', reference_id: input.paymentId, status: 'COMPLETED' },
          ],
        }),
        { status: 200 }
      )
    );
    expect((await findSquarePayment(input.paymentId, new Date().toISOString()))?.id).toBe(
      'matching-attempt'
    );
  });
});
