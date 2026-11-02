import { describe, expect, it, vi } from 'vitest';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import nextConfig from '../../../next.config';

async function policyFor(path: string) {
  const rules = await nextConfig.headers!();
  let policy = '';
  for (const rule of rules) {
    if (!getPathMatch(rule.source)(path)) continue;
    for (const header of rule.headers) {
      if (header.key.toLowerCase() === 'content-security-policy') policy = header.value;
    }
  }
  return Object.fromEntries(
    policy.split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    })
  );
}

describe('Square 3DS document security policy', () => {
  it.each(['/', '/shop', '/products/prada-symbole-pr-17ws-black-sunglasses', '/account'])(
    'permits issuer HTTPS verification form POSTs on storefront document %s',
    async (path) => {
      const policy = await policyFor(path);
      // SDK v1.87 builds a hidden POST form with action=acsUrl, target=its
      // challenge iframe and a creq field. This is a form-action check, NOT
      // connect-src or frame-src; 'self' alone blocks it before network IO.
      expect(policy['form-action']).toEqual(["'self'", 'https:']);
      expect(policy['frame-src']).toContain('https:');
      expect(policy['form-action']).not.toContain('http:');
      expect(policy['form-action']).not.toContain('*');
    }
  );

  it.each([
    '/admin',
    '/admin/payments',
    '/auth/sign-in',
    '/auth/reset-password',
    '/api/payments/square',
    '/api/health',
  ])('keeps same-origin-only forms on sensitive document %s', async (path) => {
    expect((await policyFor(path))['form-action']).toEqual(["'self'"]);
  });

  it('does not weaken the other production directives to fix verification', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const policy = await policyFor('/products/example');
      expect(policy['default-src']).toEqual(["'self'"]);
      expect(policy['script-src']).toEqual([
        "'self'",
        "'unsafe-inline'",
        'https://web.squarecdn.com',
      ]);
      expect(policy['style-src']).toEqual([
        "'self'",
        "'unsafe-inline'",
        'https://web.squarecdn.com',
      ]);
      expect(policy['object-src']).toEqual(["'none'"]);
      expect(policy['base-uri']).toEqual(["'self'"]);
      expect(policy['frame-ancestors']).toEqual(["'none'"]);
      expect(policy['script-src']).not.toContain("'unsafe-eval'");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
