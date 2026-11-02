// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { safeAuthRedirect } from '@/lib/auth-redirect';
const exchange = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));
import { GET } from '@/app/auth/callback/route';

describe('authentication callback redirect boundary', () => {
  it.each([
    undefined,
    null,
    '',
    '@example.org',
    '//example.org',
    'https://example.org',
    '/\\example.org',
    '/\n/example.org',
  ])('rejects unsafe destination %s', (value) => {
    expect(safeAuthRedirect(value)).toBe('/account');
  });
  it.each([
    '/account',
    '/account/orders?tab=active#latest',
    '/auth/reset-password',
    '/consign/new',
  ])('preserves same-origin destination %s', async (next) => {
    exchange.mockResolvedValue({ error: null });
    const url = new URL('http://localhost:3031/auth/callback');
    url.searchParams.set('code', 'test-only-code');
    url.searchParams.set('next', next);
    expect((await GET(new Request(url))).headers.get('location')).toBe(
      `http://localhost:3031${next}`
    );
  });
  it('never redirects to userinfo syntax even after a successful exchange', async () => {
    exchange.mockResolvedValue({ error: null });
    const response = await GET(
      new Request(
        'https://www.streetculturevault.com/auth/callback?code=test-only&next=%40example.org'
      )
    );
    expect(response.headers.get('location')).toBe('https://www.streetculturevault.com/account');
  });
  it('keeps failed exchanges on the sign-in error page', async () => {
    exchange.mockResolvedValue({ error: new Error('invalid code') });
    expect(
      (
        await GET(new Request('http://localhost:3031/auth/callback?code=invalid&next=/account'))
      ).headers.get('location')
    ).toBe('http://localhost:3031/auth/sign-in?error=auth_callback_failed');
  });
});
