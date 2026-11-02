import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  consumeGuestCheckoutRateLimit,
  guestOrderCookieName,
  hashGuestOrderToken,
} from '@/lib/payments/guest-checkout';
import { reconcileSquarePayment } from '@/lib/payments/square-reconciliation';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;
const schema = z.object({ order_id: z.string().uuid(), payment_id: z.string().uuid() });
function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid Square status request.' }, 400);
  try {
    const admin = createAdminClient();
    if (!(await consumeGuestCheckoutRateLimit(admin, request, 'square-status', 300))) {
      return json({ error: 'Too many status checks. Wait briefly and try again.' }, 429);
    }
    const token = (await cookies()).get(guestOrderCookieName(parsed.data.order_id))?.value;
    if (!token) return json({ error: 'This checkout has expired.' }, 401);
    const { data: order, error } = await admin
      .from('orders')
      .select('id')
      .eq('id', parsed.data.order_id)
      .eq('guest_access_token_hash', hashGuestOrderToken(token))
      .maybeSingle();
    if (error || !order) return json({ error: 'Checkout could not be verified.' }, 404);
    const { data: payment } = await admin
      .from('payments')
      .select('id')
      .eq('id', parsed.data.payment_id)
      .eq('order_id', order.id)
      .eq('provider', 'square')
      .maybeSingle();
    if (!payment) return json({ error: 'Payment record was not found.' }, 404);
    const result = await reconcileSquarePayment(payment.id);
    return json(result, result.status === 'PROCESSING' ? 202 : 200);
  } catch {
    return json(
      {
        status: 'PROCESSING',
        error: 'Payment confirmation is taking longer. Check again before paying.',
      },
      202
    );
  }
}
