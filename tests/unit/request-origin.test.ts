import { describe, expect, it } from 'vitest';
import { hasSameRequestOrigin } from '@/lib/request-origin';
describe('saved address CSRF checks behind Next.js', () => {
  const request = (
    origin: string,
    host: string,
    url = 'http://localhost:3031/api/account/addresses'
  ) => new Request(url, { headers: { origin, host } });
  it('accepts the browser loopback host even when Next uses an internal hostname', () => {
    expect(hasSameRequestOrigin(request('http://127.0.0.1:3031', '127.0.0.1:3031'))).toBe(true);
  });
  it('accepts the HTTPS store host behind a proxy', () => {
    expect(
      hasSameRequestOrigin(
        request('https://www.streetculturevault.com', 'www.streetculturevault.com')
      )
    ).toBe(true);
  });
  it('rejects cross-origin, missing, malformed and insecure remote origins', () => {
    for (const origin of [
      'https://attacker.invalid',
      'null',
      'https://www.streetculturevault.com/extra',
      'http://www.streetculturevault.com',
      '',
    ])
      expect(hasSameRequestOrigin(request(origin, 'www.streetculturevault.com'))).toBe(false);
  });
  it('ignores a forged forwarded-host', () => {
    const value = request('https://attacker.invalid', 'www.streetculturevault.com');
    value.headers.set('x-forwarded-host', 'attacker.invalid');
    expect(hasSameRequestOrigin(value)).toBe(false);
  });
});
