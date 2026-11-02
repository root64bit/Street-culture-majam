// Public, read-only release smoke checks. No checkout, send or booking requests.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const origin = 'https://www.streetculturevault.com',
  results = [];
const check = (name, ok) => {
  results.push({ name, pass: Boolean(ok) });
  if (!ok) throw new Error(name + ' failed');
};
try {
  const storefront = await fetch(origin + '/products/prada-symbole-pr-17ws-black-sunglasses', {
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  check('Storefront available', storefront.status === 200);
  check(
    'Square issuer verification policy preserved',
    storefront.headers.get('content-security-policy')?.includes("form-action 'self' https:")
  );
  for (const route of ['/admin/communications', '/admin/marketing']) {
    const response = await fetch(origin + route, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    check(
      route + ' requires sign-in',
      [302, 303, 307, 308].includes(response.status) &&
        response.headers.get('location')?.includes('/auth/sign-in')
    );
    check(
      route + ' retains strict form policy',
      response.headers.get('content-security-policy')?.includes("form-action 'self';")
    );
  }
  const worker = await fetch(origin + '/api/cron/orders', {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
  });
  check('Worker denies unauthenticated requests', worker.status === 401);
  check('Worker response is private', worker.headers.get('cache-control') === 'no-store');
  const bytes = readFileSync('public/.well-known/apple-developer-merchantid-domain-association'),
    digest = (value) => createHash('sha256').update(value).digest('hex');
  for (const host of [origin, 'https://streetculturevault.com']) {
    const response = await fetch(
      host + '/.well-known/apple-developer-merchantid-domain-association',
      { redirect: 'manual', signal: AbortSignal.timeout(20000) }
    );
    check(
      host + ' Apple Pay association has no redirect',
      response.status === 200 && !response.headers.has('location')
    );
    check(
      host + ' Apple Pay file unchanged',
      digest(Buffer.from(await response.arrayBuffer())) === digest(bytes)
    );
  }
  writeFileSync(
    'outputs/order-communications-release/20261019/live-smoke.json',
    JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    { flag: 'wx' }
  );
  console.log(JSON.stringify({ passed: results.length, failed: 0 }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Live smoke failed');
  process.exitCode = 1;
}
