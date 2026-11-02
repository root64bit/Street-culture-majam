import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
export const checkoutSessionCookie = 'sc_checkout_session';
export function checkoutSessionHash(token: string | undefined) {
  return token && /^[a-f0-9]{64}$/.test(token)
    ? createHash('sha256').update(token).digest('hex')
    : null;
}
export function newCheckoutSession() {
  return randomBytes(32).toString('hex');
}
