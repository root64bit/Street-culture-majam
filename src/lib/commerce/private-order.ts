import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { guestOrderCookieName, hashGuestOrderToken } from '@/lib/payments/guest-checkout';

export const privateOrderAccess = cache(async (orderId: string) => {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id,user_id,status,payment_status,guest_access_token_hash')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return null;
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const token = (await cookies()).get(guestOrderCookieName(orderId))?.value;
  const supplied = token ? Buffer.from(hashGuestOrderToken(token), 'hex') : null;
  const expected = order.guest_access_token_hash
    ? Buffer.from(order.guest_access_token_hash, 'hex')
    : null;
  const guest =
    supplied &&
    expected &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected);
  if (!guest && (!user || order.user_id !== user.id)) return null;
  return { admin, order };
});
