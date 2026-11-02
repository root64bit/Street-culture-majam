// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('@/lib/admin/access', () => ({ adminApiClient: mocks.access }));
vi.mock('@/lib/payments/payfast-sandbox-store', () => ({
  createSandboxSession: mocks.create,
  getSandboxSession: mocks.get,
  completeSandboxSession: mocks.complete,
}));
import { paymentProviderAllowed } from '@/lib/payments/provider-policy';
import { sandboxEnabled, sandboxConfig } from '@/lib/payments/payfast-sandbox';
import { GET, POST } from '@/app/sandbox/payfast/route';
import { POST as notify } from '@/app/api/payments/payfast-sandbox/notify/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PAYFAST_SANDBOX_ENABLED', 'true');
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('M-Pesa only while card gateways are disconnected', () => {
  it('allows M-Pesa and blocks disconnected providers', () => {
    expect(paymentProviderAllowed('mpesa')).toBe(true);
    for (const provider of ['stripe', 'square', 'payfast', 'paystack', 'paypal', '', 'STRIPE'])
      expect(paymentProviderAllowed(provider)).toBe(false);
  });
  it('cannot re-enable PayFast by setting its old environment flag', () => {
    expect(sandboxEnabled()).toBe(false);
    expect(() => sandboxConfig()).toThrow('disabled');
  });
  it('blocks both the old test page and new sessions before authentication or database access', async () => {
    expect(
      (await GET(new Request('https://www.streetculturevault.com/sandbox/payfast'))).status
    ).toBe(404);
    expect(
      (
        await POST(
          new Request('https://www.streetculturevault.com/sandbox/payfast', { method: 'POST' })
        )
      ).status
    ).toBe(404);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects old PayFast notifications without changing test or real orders', async () => {
    expect(
      (
        await notify(
          new Request('https://www.streetculturevault.com/api/payments/payfast-sandbox/notify', {
            method: 'POST',
            body: '{}',
          })
        )
      ).status
    ).toBe(503);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
