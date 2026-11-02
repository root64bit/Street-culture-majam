import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { assertExternalServicesAllowed } from '@/lib/external-services';
import { paymentProviderAllowed } from '@/lib/payments/provider-policy';

// Deliberately NOT a production payment gateway. No configurable/live endpoint.
export const PAYFAST_SANDBOX_PROCESS_URL = 'https://sandbox.payfast.co.za/eng/process';
export const PAYFAST_SANDBOX_VALIDATE_URL = 'https://sandbox.payfast.co.za/eng/query/validate';
export const SANDBOX_AMOUNT_MINOR = 1000; // Synthetic ZAR 10.00; never a catalogue price.
export const SANDBOX_ITEM_NAME = 'Street Culture - SANDBOX TEST - no goods';
export const SANDBOX_REFERENCE =
  /^SC-SBX-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

export function sandboxEnabled() {
  return paymentProviderAllowed('payfast') && process.env.PAYFAST_SANDBOX_ENABLED === 'true';
}

export function sandboxConfig() {
  if (!sandboxEnabled()) throw new Error('PayFast Sandbox is disabled.');
  const merchantId = process.env.PAYFAST_SANDBOX_MERCHANT_ID?.trim();
  const merchantKey = process.env.PAYFAST_SANDBOX_MERCHANT_KEY?.trim();
  const passphrase = process.env.PAYFAST_SANDBOX_PASSPHRASE?.trim();
  if (
    !merchantId ||
    !/^\d{8}$/.test(merchantId) ||
    !merchantKey ||
    !passphrase ||
    [merchantId, merchantKey, passphrase].some((v) => v === '[SENSITIVE]')
  ) {
    throw new Error('PayFast Sandbox credentials are not configured.');
  }
  const url = new URL(process.env.PAYFAST_SANDBOX_SITE_URL || 'https://www.streetculturevault.com');
  const local =
    process.env.VERCEL !== '1' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (!local && url.origin !== 'https://www.streetculturevault.com')
  ) {
    throw new Error('Unexpected Sandbox callback origin.');
  }
  return { merchantId, merchantKey, passphrase, origin: url.origin };
}

// PHP urlencode (RFC 1738), not encodeURIComponent or alphabetical API signing.
export function payfastEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

export function parameterString(
  entries: readonly (readonly [string, string])[],
  notification = false
) {
  return entries
    .filter(([key, value]) => key !== 'signature' && (notification || value.trim() !== ''))
    .map(([key, value]) => `${key}=${payfastEncode(notification ? value : value.trim())}`)
    .join('&');
}

export function payfastSignature(
  entries: readonly (readonly [string, string])[],
  passphrase: string,
  notification = false
) {
  const value = `${parameterString(entries, notification)}&passphrase=${payfastEncode(passphrase)}`;
  return createHash('md5').update(value).digest('hex');
}

export function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function sandboxCheckoutFields(sessionId: string, token: string) {
  if (!SANDBOX_REFERENCE.test(`SC-SBX-${sessionId}`) || !/^[0-9a-f]{64}$/.test(token))
    throw new Error('Invalid synthetic checkout identifier.');
  const config = sandboxConfig();
  // Keep insertion order in sync with PayFast's custom-integration field order.
  const entries: [string, string][] = [
    ['merchant_id', config.merchantId],
    ['merchant_key', config.merchantKey],
    ['return_url', `${config.origin}/sandbox/payfast?session=${sessionId}&returned=1`],
    ['cancel_url', `${config.origin}/sandbox/payfast?session=${sessionId}&cancelled=1`],
    ['notify_url', `${config.origin}/api/payments/payfast-sandbox/notify`],
    ['m_payment_id', `SC-SBX-${sessionId}`],
    ['amount', '10.00'],
    ['item_name', SANDBOX_ITEM_NAME],
    ['item_description', 'Virtual wallet integration test only. No sale or delivery.'],
    ['custom_str1', token],
  ];
  return [...entries, ['signature', payfastSignature(entries, config.passphrase)]] as [
    string,
    string,
  ][];
}

export function parseItn(raw: string) {
  if (!raw || Buffer.byteLength(raw) > 16384 || /%(?![0-9a-fA-F]{2})/.test(raw))
    throw new Error('Invalid notification body.');
  const entries = [...new URLSearchParams(raw).entries()];
  const keys = entries.map(([key]) => key);
  if (new Set(keys).size !== keys.length || keys.some((key) => !/^[a-z][a-z0-9_]{0,63}$/.test(key)))
    throw new Error('Invalid notification fields.');
  const fields = Object.fromEntries(entries);
  if (
    !/^[0-9a-f]{32}$/.test(fields.signature || '') ||
    !SANDBOX_REFERENCE.test(fields.m_payment_id || '') ||
    !/^\d{1,30}$/.test(fields.pf_payment_id || '') ||
    !/^[0-9a-f]{64}$/.test(fields.custom_str1 || '')
  )
    throw new Error('Invalid notification identifiers.');
  return { entries, fields };
}

export function zarMinor(value: string, signed = false) {
  if (!(signed ? /^-?\d{1,9}\.\d{2}$/ : /^\d{1,9}\.\d{2}$/).test(value || ''))
    throw new Error('Invalid ZAR amount.');
  const negative = value.startsWith('-');
  const [major, cents] = value.replace(/^-/, '').split('.');
  return (Number(major) * 100 + Number(cents)) * (negative ? -1 : 1);
}

// Current PayFast-published ranges. Fail closed if they change; do not trust Referer.
export function isPayfastIp(address: string) {
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(ip) !== 4) return false;
  const numeric = ip.split('.').reduce((value, part) => value * 256 + Number(part), 0);
  return [
    ['197.97.145.144', 28],
    ['41.74.179.192', 27],
    ['102.216.36.0', 28],
    ['102.216.36.128', 28],
    ['144.126.193.139', 32],
  ].some(([base, bits]) => {
    const start = String(base)
      .split('.')
      .reduce((value, part) => value * 256 + Number(part), 0);
    const size = 2 ** (32 - Number(bits));
    return numeric >= start && numeric < start + size;
  });
}

export function validSandboxSender(request: Request) {
  // Vercel sets this header; arbitrary forwarded headers are NOT trusted locally.
  return (
    process.env.VERCEL === '1' && isPayfastIp(request.headers.get('x-vercel-forwarded-for') || '')
  );
}

export async function confirmSandboxItn(entries: [string, string][]) {
  assertExternalServicesAllowed();
  const response = await fetch(PAYFAST_SANDBOX_VALIDATE_URL, {
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: parameterString(entries, true),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Sandbox validation temporarily unavailable.');
  return (await response.text()).trim() === 'VALID';
}
