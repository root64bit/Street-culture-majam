import 'server-only';

import { createHash, createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export function guestOrderCookieName(orderId: string) {
  return `sc_guest_order_${orderId.replaceAll('-', '')}`;
}

export function hashGuestOrderToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function consumeGuestCheckoutRateLimit(
  supabase: SupabaseClient<Database>,
  request: Request,
  scope: string,
  maxAttempts: number,
) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return false;

  const addressHeader =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for') ??
    'unknown';
  const address = addressHeader.split(',')[0]?.trim() || 'unknown';
  const keyHash = createHmac('sha256', secret).update(`${scope}:${address}`).digest('hex');
  const { data, error } = await supabase.rpc('consume_guest_checkout_rate_limit', {
    target_key_hash: keyHash,
    target_max_attempts: maxAttempts,
    target_window_seconds: 3600,
  });

  if (error) throw new Error('Checkout rate limit is unavailable.');
  return data === true;
}
