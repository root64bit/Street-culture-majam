// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMineScopePayment } from '@/lib/payments/minescope';
import { PaymentStatusUnavailableError } from '@/lib/payments/types';
beforeEach(() => {
  vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'true');
  vi.stubEnv('SC_EXTERNAL_SERVICES', 'allowed');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('MineScope status outage safety', () => {
  it('uses the documented status contract and full 60-second provider window', async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, responseCode: 'INS-0', transactionStatus: 'Pending' })
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await getMineScopePayment('ST1234ABCD');
      expect(timeout).toHaveBeenCalledWith(60000);
      expect(fetchMock.mock.calls[0][0]).toBe('https://minescoop-mz.web.app/api/mpesa/status');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        queryRef: 'ST1234ABCD',
        thirdPartyRef: 'ST1234ABCD',
      });
    } finally {
      timeout.mockRestore();
    }
  });
  it.each([500, 503])(
    'handles the observed HTML HTTP %s without inventing a payment result',
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response('<html>Server Error</html>', { status }));
      vi.stubGlobal('fetch', fetchMock);
      await expect(getMineScopePayment('ST1234ABCD')).rejects.toBeInstanceOf(
        PaymentStatusUnavailableError
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toMatch(/\/status$/);
    }
  );
  it('ignores even a cancellation payload on HTTP 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: false, responseCode: 'INS-5' }), { status: 500 })
        )
    );
    await expect(getMineScopePayment('ST1234ABCD')).rejects.toBeInstanceOf(
      PaymentStatusUnavailableError
    );
  });
  it('treats a status network error as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getMineScopePayment('ST1234ABCD')).rejects.toBeInstanceOf(
      PaymentStatusUnavailableError
    );
  });
  it('still requires a successful Completed response before confirming money', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ success: true, responseCode: 'INS-0', transactionStatus: 'Completed' })
          )
        )
    );
    expect((await getMineScopePayment('ST1234ABCD')).status).toBe('PAID');
  });
});
