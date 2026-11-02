// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Retain isolated protocol regression tests for historical data. This mock is
// test-only; the real retired-gateway policy is covered in provider-policy.test.ts.
vi.mock('@/lib/payments/provider-policy', () => ({ paymentProviderAllowed: () => true }));
import {
  confirmSandboxItn,
  isPayfastIp,
  parameterString,
  parseItn,
  payfastEncode,
  payfastSignature,
  sandboxCheckoutFields,
  sandboxConfig,
  tokenHash,
  validSandboxSender,
  zarMinor,
} from '@/lib/payments/payfast-sandbox';
import { sandboxHome, sandboxRedirectForm } from '@/lib/payments/payfast-sandbox-view';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('@/lib/admin/access', () => ({ adminApiClient: mocks.access }));
vi.mock('@/lib/payments/payfast-sandbox-store', () => ({
  getSandboxSession: mocks.get,
  createSandboxSession: mocks.create,
  completeSandboxSession: mocks.complete,
}));
import { GET as home, POST as start } from '@/app/sandbox/payfast/route';
import { POST as notify } from '@/app/api/payments/payfast-sandbox/notify/route';

const id = 'd0000000-0000-4000-8000-000000000001',
  token = 'ab'.repeat(32),
  passphrase = 'unit-test-secret';
function entries(overrides: Record<string, string> = {}) {
  return Object.entries({
    m_payment_id: `SC-SBX-${id}`,
    pf_payment_id: '12345',
    payment_status: 'COMPLETE',
    item_name: 'Street Culture - SANDBOX TEST - no goods',
    item_description: '',
    amount_gross: '10.00',
    amount_fee: '-0.23',
    amount_net: '9.77',
    custom_str1: token,
    custom_str2: '',
    name_first: '',
    merchant_id: '10000100',
    ...overrides,
  });
}
function itn(data = entries(), ip = '197.97.145.144') {
  return new Request('https://www.streetculturevault.com/api/payments/payfast-sandbox/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-vercel-forwarded-for': ip },
    body: new URLSearchParams([...data, ['signature', payfastSignature(data, passphrase, true)]]),
  });
}
beforeEach(() => {
  vi.stubEnv('PAYFAST_SANDBOX_ENABLED', 'true');
  vi.stubEnv('PAYFAST_SANDBOX_MERCHANT_ID', '10000100');
  vi.stubEnv('PAYFAST_SANDBOX_MERCHANT_KEY', 'unit-test-key');
  vi.stubEnv('PAYFAST_SANDBOX_PASSPHRASE', passphrase);
  vi.stubEnv('PAYFAST_SANDBOX_SITE_URL', 'https://www.streetculturevault.com');
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('SC_EXTERNAL_SERVICES', 'allowed');
  mocks.access.mockResolvedValue({ user: { id } });
  mocks.create.mockResolvedValue(undefined);
  mocks.complete.mockResolvedValue(undefined);
  mocks.get.mockResolvedValue({
    id,
    created_by: id,
    amount_minor: 1000,
    state: 'PENDING',
    callback_token_hash: tokenHash(token),
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('VALID')));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('PayFast Sandbox protocol', () => {
  it('uses PHP URL encoding including tildes and spaces', () => {
    expect(payfastEncode("a b+~!'()*")).toBe('a+b%2B%7E%21%27%28%29%2A');
  });
  it('distinguishes checkout nonblank signing from ITN all-field signing', () => {
    const input: [string, string][] = [
      ['z', ' one '],
      ['empty', ''],
      ['a', 'two'],
    ];
    expect(parameterString(input)).toBe('z=one&a=two');
    expect(parameterString(input, true)).toBe('z=+one+&empty=&a=two');
    expect(payfastSignature(input, 'pass', true)).toBe(
      createHash('md5').update('z=+one+&empty=&a=two&passphrase=pass').digest('hex')
    );
  });
  it('hardcodes virtual ZAR amount and Sandbox endpoint with no passphrase in form', async () => {
    const fields = sandboxCheckoutFields(id, token);
    expect(Object.fromEntries(fields).amount).toBe('10.00');
    expect(Object.fromEntries(fields).signature).toBe(payfastSignature(fields, passphrase));
    const html = await sandboxRedirectForm(fields).text();
    expect(html).toContain('action="https://sandbox.payfast.co.za/eng/process"');
    expect(html).not.toContain(passphrase);
    expect(html).not.toContain('action="https://www.payfast.co.za');
  });
  it.each(['false', ''])('fails closed when flag is %s', (flag) => {
    vi.stubEnv('PAYFAST_SANDBOX_ENABLED', flag);
    expect(() => sandboxConfig()).toThrow();
  });
  it('refuses preview placeholder credentials and arbitrary callback origins', () => {
    vi.stubEnv('PAYFAST_SANDBOX_SITE_URL', 'https://attacker.example');
    expect(() => sandboxConfig()).toThrow();
    vi.stubEnv('PAYFAST_SANDBOX_SITE_URL', 'https://www.streetculturevault.com');
    vi.stubEnv('PAYFAST_SANDBOX_PASSPHRASE', '[SENSITIVE]');
    expect(() => sandboxConfig()).toThrow();
  });
  it.each(['1e2', '10', '10.001', 'Infinity', '-1.00'])('refuses non-exact amount %s', (value) => {
    expect(() => zarMinor(value)).toThrow();
  });
  it('parses signed fees as exact cents', () => {
    expect(zarMinor('-0.23', true)).toBe(-23);
  });
  it.each([
    '197.97.145.144',
    '197.97.145.159',
    '41.74.179.223',
    '102.216.36.143',
    '144.126.193.139',
  ])('accepts published IP %s', (ip) => expect(isPayfastIp(ip)).toBe(true));
  it.each(['197.97.145.160', '127.0.0.1', '197.97.145.144, 127.0.0.1', '::1', '999.0.0.1'])(
    'rejects source %s',
    (ip) => expect(isPayfastIp(ip)).toBe(false)
  );
  it('never trusts local forwarded header spoofing', () => {
    vi.stubEnv('VERCEL', '');
    expect(validSandboxSender(itn())).toBe(false);
  });
  it('refuses duplicate and malformed fields', () => {
    const data = entries();
    const raw = new URLSearchParams([
      ...data,
      ['signature', payfastSignature(data, passphrase, true)],
    ]).toString();
    expect(() => parseItn(`${raw}&amount_gross=20.00`)).toThrow();
    expect(() => parseItn(`${raw}&bad=%zz`)).toThrow();
    expect(() => parseItn('x'.repeat(16385))).toThrow();
  });
  it('validates only against Sandbox, preserves empty fields and rejects redirects', async () => {
    expect(await confirmSandboxItn(entries())).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://sandbox.payfast.co.za/eng/query/validate',
      expect.objectContaining({ redirect: 'error', body: parameterString(entries(), true) })
    );
    vi.stubEnv('SC_EXTERNAL_SERVICES', 'disabled');
    await expect(confirmSandboxItn(entries())).rejects.toThrow();
  });
});

describe('admin-only isolated test tool', () => {
  it('blocks all work when disabled', async () => {
    vi.stubEnv('PAYFAST_SANDBOX_ENABLED', 'false');
    expect(
      (await home(new Request('https://www.streetculturevault.com/sandbox/payfast'))).status
    ).toBe(404);
    expect((await notify(itn())).status).toBe(503);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects customer access with a helpful sign-in response', async () => {
    mocks.access.mockResolvedValue({ error: 'Denied', status: 403 });
    const response = await home(new Request('https://www.streetculturevault.com/sandbox/payfast'));
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('administrator account');
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('requires same-origin POST before creating any test record', async () => {
    const response = await start(
      new Request('https://www.streetculturevault.com/sandbox/payfast', {
        method: 'POST',
        headers: { Origin: 'https://attacker.example' },
      })
    );
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('ignores posted amounts, uses server-generated reference and only test storage', async () => {
    const response = await start(
      new Request('https://www.streetculturevault.com/sandbox/payfast', {
        method: 'POST',
        headers: { Origin: 'https://www.streetculturevault.com' },
        body: 'amount=0.01&order_id=real',
      })
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('value="10.00"');
    expect(mocks.create).toHaveBeenCalledWith({
      id: expect.any(String),
      created_by: id,
      callback_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });
  it('return/cancel URLs never complete or cancel a payment', async () => {
    const response = await home(
      new Request(
        `https://www.streetculturevault.com/sandbox/payfast?session=${id}&returned=1&cancelled=1`
      )
    );
    expect(await response.text()).toContain('Awaiting verified');
    expect(mocks.complete).not.toHaveBeenCalled();
    const xss = await sandboxHome({
      id: '<script>',
      amount_minor: 1000,
      state: 'PENDING',
    } as never).text();
    expect(xss).not.toContain('<script>');
    expect(xss).toContain('&lt;script&gt;');
  });
});

describe('verified Sandbox ITN', () => {
  it('records only after all checks and provider confirmation', async () => {
    expect((await notify(itn())).status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith({
      target_session: id,
      target_provider: '12345',
      target_gross: 1000,
      target_fee: 23,
      target_net: 977,
      target_token_hash: tokenHash(token),
    });
  });
  it('rejects spoofed source before reading database', async () => {
    expect((await notify(itn(entries(), '127.0.0.1'))).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('rejects tampered signatures', async () => {
    const request = itn();
    const raw = (await request.text()).replace('amount_gross=10.00', 'amount_gross=11.00');
    expect(
      (
        await notify(
          new Request(request.url, { method: 'POST', headers: request.headers, body: raw })
        )
      ).status
    ).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  const invalidCases: Record<string, string>[] = [
    { merchant_id: '10000999' },
    { amount_gross: '20.00' },
    { amount_net: '0.00' },
    { item_name: 'Real goods' },
    { payment_status: 'CANCELLED' },
  ];
  it.each(invalidCases)('rejects invalid business data %j', async (overrides) => {
    expect((await notify(itn(entries(overrides)))).status).not.toBe(200);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('rejects unknown token even with valid signature', async () => {
    expect((await notify(itn(entries({ custom_str1: 'cd'.repeat(32) })))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not trust INVALID server response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('INVALID'));
    expect((await notify(itn())).status).toBe(403);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('returns retryable failure for uncertain validation or failed durable write', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'));
    expect((await notify(itn())).status).toBe(503);
    mocks.complete.mockRejectedValueOnce(new Error('storage'));
    expect((await notify(itn())).status).toBe(503);
  });
});
