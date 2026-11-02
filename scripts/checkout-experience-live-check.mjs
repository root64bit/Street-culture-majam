// Public release checks only. Invalid payment payloads fail before any provider call.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const origin = 'https://www.streetculturevault.com';
const alias = 'https://street-culture-majam.vercel.app';
const results = [];
const internationalMpesa = process.env.SC_RELEASE_KIND === 'mpesa-international';
const request = (url, options = {}) =>
  fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000), ...options });
function check(name, pass) {
  results.push({ name, pass: Boolean(pass) });
  if (!pass) throw new Error(name + ' failed');
}
try {
  const productPath = '/products/prada-symbole-pr-17ws-black-sunglasses';
  const storefront = await request(origin + productPath);
  check('Storefront available', storefront.status === 200);
  check(
    'Square issuer verification retained',
    storefront.headers.get('content-security-policy')?.includes("form-action 'self' https:")
  );
  const redirect = await request(alias + productPath + '?source=release-check');
  check(
    'Production alias uses the verified store without losing the link',
    [307, 308].includes(redirect.status) &&
      redirect.headers.get('location') === origin + productPath + '?source=release-check'
  );
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const association = '/.well-known/apple-developer-merchantid-domain-association';
  const expected = digest(readFileSync('public' + association));
  for (const host of [origin, 'https://streetculturevault.com']) {
    const response = await request(host + association);
    check(
      host + ' Apple Pay file is served directly',
      response.status === 200 && !response.headers.has('location')
    );
    check(
      host + ' Apple Pay file matches',
      digest(Buffer.from(await response.arrayBuffer())) === expected
    );
  }
  for (const host of [origin, alias]) {
    const response = await request(host + '/api/payments/square', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    check(
      host + ' invalid payment cannot charge or redirect',
      response.status === 400 && !response.headers.has('location')
    );
  }
  const mpesa = await request(origin + '/api/payments/mpesa/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('Existing M-Pesa availability retained without initiating a payment', mpesa.status === 400);
  if (internationalMpesa) {
    const shopHtml = await (await request(origin + '/shop')).text();
    const sources = [...shopHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    let walletUi = false;
    for (const source of sources) {
      const js = await (await request(new URL(source, origin))).text();
      if (
        js.includes('M-Pesa wallet number') &&
        js.includes('Any delivery destination') &&
        js.includes('Your delivery contact number stays unchanged')
      )
        walletUi = true;
    }
    check('Live bundle includes international delivery and separate M-Pesa wallet UI', walletUi);
    const unsigned = await request(origin + '/api/payments/mpesa/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: '11111111-1111-4111-8111-111111111111',
        phone: '+258841234567',
      }),
    });
    check('A valid wallet still requires the private checkout cookie', unsigned.status === 401);
  }
  const identity = await request(origin + '/api/account/checkout');
  check(
    'Guest identity has no customer details',
    identity.status === 200 && JSON.stringify(await identity.json()) === '{"signedIn":false}'
  );
  check(
    'Checkout identity is private',
    identity.headers.get('cache-control')?.includes('private') &&
      identity.headers.get('cache-control')?.includes('no-store')
  );
  const denied = await request(origin + '/api/account/addresses', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('Address write requires authentication', denied.status === 401);
  const crossOrigin = await request(origin + '/api/account/addresses', {
    method: 'POST',
    headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('Cross-origin address write denied', crossOrigin.status === 403);
  const access = await request(origin + '/auth/access?area=staff&redirectTo=%2Fadmin%2Forders');
  const accessHtml = await access.text();
  check(
    'Account guidance replaces a plain 404',
    access.status === 200 && accessHtml.includes('right account') && accessHtml.includes('staff')
  );
  check('Account guidance is not indexed', accessHtml.includes('noindex'));
  check(
    'Account pages retain strict form policy',
    access.headers.get('content-security-policy')?.includes("form-action 'self';")
  );
  for (const route of ['/order/SC00000000', '/order/not-an-order']) {
    const response = await request(origin + route);
    check(
      'Unknown and inaccessible order paths use private guidance: ' + route,
      [302, 303, 307, 308].includes(response.status) &&
        response.headers.get('location')?.includes('/auth/access?area=order')
    );
  }
  const admin = await request(origin + '/admin/communications');
  check(
    'Staff page still requires sign-in',
    [302, 303, 307, 308].includes(admin.status) &&
      admin.headers.get('location')?.includes('/auth/sign-in')
  );
  const worker = await request(origin + '/api/cron/orders', { method: 'POST' });
  check('Notification worker still denies unsigned calls', worker.status === 401);
  writeFileSync(
    internationalMpesa
      ? 'outputs/mpesa-international-release/20261019/live-smoke.json'
      : 'outputs/checkout-experience-release/20261019/live-smoke.json',
    JSON.stringify(
      { results, checkedAt: new Date().toISOString(), noPaymentsOrMessagesSent: true },
      null,
      2
    ),
    { flag: 'wx' }
  );
  console.log(JSON.stringify({ passed: results.length, failed: 0 }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Live smoke check failed');
  process.exitCode = 1;
}
