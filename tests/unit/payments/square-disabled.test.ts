// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), cookie: vi.fn(), charge: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('next/headers', () => ({ cookies: mocks.cookie }));
vi.mock('@/lib/payments/square', () => ({ createSquarePayment: mocks.charge }));
import { POST as charge } from '@/app/api/payments/square/route';
import { POST as quote } from '@/app/api/payments/square/quote/route';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('disconnected Square gateway', () => {
  it.each([
    ['charge', charge, 'false'],
    ['quote', quote, 'false'],
    ['charge with a stale enabled flag', charge, 'true'],
    ['quote with a stale enabled flag', quote, 'true'],
  ] as const)(
    'blocks the %s endpoint before any database or provider work',
    async (_name, handler, flag) => {
      vi.stubEnv('SQUARE_PAYMENTS_ENABLED', flag);
      const response = await handler(
        new Request('https://www.streetculturevault.com/api/payments/square', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.cookie).not.toHaveBeenCalled();
      expect(mocks.charge).not.toHaveBeenCalled();
    }
  );
});
