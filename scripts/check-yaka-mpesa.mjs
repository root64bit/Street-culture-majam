// No-debit diagnostic. Only /health and /v1/readiness are allowed here.
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve, join } from 'node:path';

const root = process.cwd();
const settings = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'));
const origin = 'https://yaka-mpesa-gateway.vercel.app';
const folder = resolve('outputs/mpesa-yaka-release/20261102');
mkdirSync(folder, { recursive: true });
const report = { checkedAt: new Date().toISOString(), origin, realPaymentSubmitted: false };
try {
  const health = await fetch(origin + '/health', {
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const payload = await health.json();
  report.health = health.ok && payload.service === 'yaka-mpesa-gateway' &&
    payload.status === 'alive' && payload.environment === 'production' ? 'PASS' : 'FAIL';
  const secret = settings.MPESA_GATEWAY_SHARED_SECRET?.trim();
  if (!secret || secret.length < 32) {
    report.authenticatedReadiness = 'BLOCKED_MISSING_SHARED_SECRET';
    process.exitCode = 1;
  } else {
    const path = '/v1/readiness', body = '{}', timestamp = String(Date.now()), nonce = randomUUID();
    const signature = createHmac('sha256', secret)
      .update(`v2.POST.${path}.${timestamp}.${nonce}.${body}`, 'utf8').digest('hex');
    const response = await fetch(origin + path, {
      method: 'POST', body, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        'X-YAKA-Gateway-Timestamp': timestamp,
        'X-YAKA-Gateway-Nonce': nonce,
        'X-YAKA-Gateway-Signature': signature,
      },
    });
    const ready = await response.json().catch(() => null);
    report.authenticatedReadiness = response.ok && ready?.environment === 'production' &&
      ready?.ok === true && ready?.liveChargesArmed === true ? 'PASS' : 'FAIL';
    report.readinessHttpStatus = response.status;
    if (report.authenticatedReadiness !== 'PASS') process.exitCode = 1;
  }
} catch {
  report.transport = 'UNAVAILABLE';
  process.exitCode = 1;
}
writeFileSync(join(folder, 'readiness.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
