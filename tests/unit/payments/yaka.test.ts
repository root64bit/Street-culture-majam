// @vitest-environment node
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertYakaReady,
  getYakaPayment,
  initiateYakaPayment,
  makeYakaPaymentRequest,
  makeYakaReferences,
} from '@/lib/payments/yaka';
import { MpesaGateway } from '@/lib/payments/gateways';
import {
  PaymentGatewayUnavailableError,
  PaymentOutcomeUnknownError,
  PaymentStatusUnavailableError,
} from '@/lib/payments/types';

const secret = 'synthetic-signing-secret-never-a-live-credential';
const input = {
  orderId: 'synthetic',
  amountMinor: 62785,
  currency: 'MZN',
  idempotencyKey: 'synthetic-attempt',
  customerPhone: '+258841234567',
};
const reference = makeYakaReferences(input.idempotencyKey).thirdPartyRef;
const accepted = {
  environment: 'production',
  data: {
    accepted: true,
    final: false,
    uncertain: false,
    responseCode: 'INS-0',
    responseDescription: 'Request processed successfully',
    transactionId: 'synthetic-txn',
    conversationId: 'synthetic-conversation',
    thirdPartyReference: reference,
    rawHttpStatus: 201,
    errorCode: null,
  },
};
const completed = {
  environment: 'production',
  data: { success: true, responseCode: 'INS-0', transactionStatus: 'Completed' },
};
let transport: ReturnType<typeof vi.fn>;
function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}
beforeEach(() => {
  vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'true');
  vi.stubEnv('SC_EXTERNAL_SERVICES', 'allowed');
  vi.stubEnv('MPESA_GATEWAY_URL', 'https://yaka-mpesa-gateway.vercel.app');
  vi.stubEnv('MPESA_GATEWAY_EXPECTED_HOST', 'yaka-mpesa-gateway.vercel.app');
  vi.stubEnv('MPESA_GATEWAY_ENV', 'production');
  vi.stubEnv('MPESA_GATEWAY_REQUEST_TIMEOUT_MS', '20000');
  vi.stubEnv('MPESA_GATEWAY_SHARED_SECRET', secret);
  transport = vi.fn().mockResolvedValue(reply(accepted, 201));
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('YAKA signed M-Pesa protocol', () => {
  it('signs exactly the transmitted JSON, method, path, timestamp and fresh nonce', async () => {
    expect((await initiateYakaPayment(input)).status).toBe('PENDING');
    const [url, options] = transport.mock.calls[0];
    const h = options.headers;
    expect(url).toBe('https://yaka-mpesa-gateway.vercel.app/v1/c2b/single-stage');
    expect(options.redirect).toBe('error');
    expect(options.cache).toBe('no-store');
    expect(h['X-YAKA-Gateway-Timestamp']).toMatch(/^\d{13}$/);
    expect(h['X-YAKA-Gateway-Nonce']).toMatch(/^[a-f0-9-]{36}$/);
    expect(h['X-YAKA-Gateway-Signature']).toBe(
      createHmac('sha256', secret)
        .update(
          `v2.POST./v1/c2b/single-stage.${h['X-YAKA-Gateway-Timestamp']}.${h['X-YAKA-Gateway-Nonce']}.${options.body}`,
          'utf8'
        )
        .digest('hex')
    );
    expect(JSON.parse(options.body)).toEqual(makeYakaPaymentRequest(input));
    expect(JSON.parse(options.body).amount).toBe('627.85');
    expect(Object.keys(JSON.parse(options.body))).toHaveLength(4);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('keeps attempt references stable but uses a fresh nonce for each request', async () => {
    await initiateYakaPayment(input);
    transport.mockImplementation(async () => reply(completed));
    await getYakaPayment(reference);
    await getYakaPayment(reference);
    const calls = transport.mock.calls;
    expect(new Set(calls.map(([, opts]) => opts.headers['X-YAKA-Gateway-Nonce'])).size).toBe(3);
    expect(JSON.parse(calls[1][1].body)).toEqual({ queryRef: reference, thirdPartyRef: reference });
    expect(makeYakaReferences(input.idempotencyKey)).toEqual(
      makeYakaReferences(input.idempotencyKey)
    );
    expect(reference).toMatch(/^SCMP[A-F0-9]{32}$/);
  });
  it.each([1, 35, 100, 7500000])('preserves exact centavos for %i minor units', (amountMinor) => {
    expect(makeYakaPaymentRequest({ ...input, amountMinor }).amount).toMatch(/^\d+\.\d{2}$/);
  });
  it.each([0, -1, 1.1, 7500001, NaN])(
    'rejects invalid amounts before a network call: %s',
    async (amountMinor) => {
      await expect(initiateYakaPayment({ ...input, amountMinor })).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it.each([
    ['MPESA_GATEWAY_URL', 'https://other.example'],
    ['MPESA_GATEWAY_URL', 'https://yaka-mpesa-gateway.vercel.app/api/mpesa'],
    ['MPESA_GATEWAY_URL', 'https://user:password@yaka-mpesa-gateway.vercel.app'],
    ['MPESA_GATEWAY_EXPECTED_HOST', 'other.example'],
    ['MPESA_GATEWAY_ENV', 'sandbox'],
    ['MPESA_GATEWAY_SHARED_SECRET', ''],
    ['MPESA_GATEWAY_REQUEST_TIMEOUT_MS', '120001'],
    ['MPESA_PAYMENTS_ENABLED', 'false'],
  ])('fails closed on invalid %s without sending credentials', async (key, value) => {
    vi.stubEnv(key, value);
    await expect(initiateYakaPayment(input)).rejects.toBeInstanceOf(PaymentGatewayUnavailableError);
    expect(transport).not.toHaveBeenCalled();
  });
  it('blocks external calls in disposable test environments', async () => {
    vi.stubEnv('SC_EXTERNAL_SERVICES', 'disabled');
    await expect(initiateYakaPayment(input)).rejects.toThrow('External services');
    expect(transport).not.toHaveBeenCalled();
  });
  it('requires both readiness flags and the production environment without sending a debit', async () => {
    transport.mockResolvedValue(
      reply({ ok: true, liveChargesArmed: true, environment: 'production' })
    );
    await assertYakaReady();
    expect(transport.mock.calls[0][0]).toMatch(/\/v1\/readiness$/);
    expect(transport.mock.calls[0][1].body).toBe('{}');
    for (const payload of [
      { ok: true, liveChargesArmed: false, environment: 'production' },
      { ok: false, liveChargesArmed: true, environment: 'production' },
      { ok: true, liveChargesArmed: true, environment: 'sandbox' },
    ]) {
      transport.mockResolvedValue(reply(payload));
      await expect(assertYakaReady()).rejects.toBeInstanceOf(PaymentGatewayUnavailableError);
    }
    expect(transport.mock.calls.every(([url]) => url.endsWith('/readiness'))).toBe(true);
  });
  it('treats gateway replays as the same pending attempt, never settled funds', async () => {
    transport.mockResolvedValue(reply({ ...accepted, replayed: true }));
    expect((await initiateYakaPayment(input)).status).toBe('PENDING');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('stores definite final provider rejection details', async () => {
    transport.mockResolvedValue(
      reply(
        {
          ...accepted,
          data: {
            ...accepted.data,
            accepted: false,
            final: true,
            responseCode: 'INS-2006',
            rawHttpStatus: 400,
            errorCode: 'INSUFFICIENT_BALANCE',
          },
        },
        422
      )
    );
    expect(await initiateYakaPayment(input)).toMatchObject({
      status: 'FAILED',
      responseCode: 'INS-2006',
      errorCode: 'INSUFFICIENT_BALANCE',
    });
  });
  it('keeps uncertain responses unresolved', async () => {
    transport.mockResolvedValue(
      reply(
        {
          ...accepted,
          data: { ...accepted.data, accepted: false, uncertain: true, responseCode: 'INS-9' },
        },
        202
      )
    );
    expect((await initiateYakaPayment(input)).status).toBe('PROCESSING');
  });
  it.each([401, 409, 503])(
    'preserves the same attempt after HTTP %i with no retry or fallback',
    async (status) => {
      transport.mockResolvedValue(
        reply({ environment: 'production', code: 'GATEWAY_ERROR' }, status)
      );
      await expect(new MpesaGateway().createPayment(input)).rejects.toBeInstanceOf(
        PaymentOutcomeUnknownError
      );
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0][0]).toContain('yaka-mpesa-gateway.vercel.app');
    }
  );
  it.each([
    { ...accepted, environment: 'sandbox' },
    { ...accepted, data: { ...accepted.data, thirdPartyReference: 'OTHER' } },
    {},
  ])('does not trust mismatched or malformed initiation responses', async (payload) => {
    transport.mockResolvedValue(reply(payload, 201));
    await expect(initiateYakaPayment(input)).rejects.toBeInstanceOf(PaymentOutcomeUnknownError);
  });
  it('keeps network timeouts unresolved without submitting twice', async () => {
    transport.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(initiateYakaPayment(input)).rejects.toBeInstanceOf(PaymentOutcomeUnknownError);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('marks paid only from the official successful Completed status', async () => {
    transport.mockResolvedValue(
      reply({ ...completed, data: { ...completed.data, transactionStatus: ' Completed ' } })
    );
    expect((await getYakaPayment(reference)).status).toBe('PAID');
    expect(transport.mock.calls[0][0]).toMatch(/\/v1\/transactions\/status$/);
  });
  it.each([
    { ...completed, data: { ...completed.data, success: false } },
    { ...completed, data: { ...completed.data, responseCode: 'INS-23' } },
    ...['Pending', 'Processing', 'Failed', 'Cancelled', ''].map((transactionStatus) => ({
      ...completed,
      data: { ...completed.data, transactionStatus },
    })),
  ])('keeps all unconfirmed status responses unresolved', async (payload) => {
    transport.mockResolvedValue(reply(payload));
    expect((await getYakaPayment(reference)).status).toBe('PROCESSING');
  });
  it.each([404, 409, 500, 503])(
    'never turns status HTTP %i into settlement or a decline',
    async (status) => {
      transport.mockResolvedValue(reply(completed, status));
      await expect(getYakaPayment(reference)).rejects.toBeInstanceOf(PaymentStatusUnavailableError);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  );
  it('rejects a status response from another environment', async () => {
    transport.mockResolvedValue(reply({ ...completed, environment: 'sandbox' }));
    await expect(getYakaPayment(reference)).rejects.toBeInstanceOf(PaymentStatusUnavailableError);
  });
  it('routes old references only to the old status service', async () => {
    transport.mockResolvedValue(
      reply({ success: true, responseCode: 'INS-0', transactionStatus: 'Completed' })
    );
    expect((await new MpesaGateway().getPayment('ST1234ABCD')).status).toBe('PAID');
    expect(transport.mock.calls[0][0]).toBe('https://minescoop-mz.web.app/api/mpesa/status');
  });
  it('keeps historical status reconciliation available with new payments disabled', async () => {
    vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'false');
    transport.mockResolvedValue(
      reply({ success: true, responseCode: 'INS-0', transactionStatus: 'Completed' })
    );
    expect((await new MpesaGateway().getPayment('ST1234ABCD')).status).toBe('PAID');
    expect(transport.mock.calls[0][0]).toMatch(/\/api\/mpesa\/status$/);
  });
  it('keeps signed status reconciliation available with new payments disabled', async () => {
    vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'false');
    transport.mockResolvedValue(reply(completed));
    expect((await new MpesaGateway().getPayment(reference)).status).toBe('PAID');
    expect(transport.mock.calls[0][0]).toMatch(/\/v1\/transactions\/status$/);
  });
});
