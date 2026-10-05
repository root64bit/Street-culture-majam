import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MpesaGateway } from '@/lib/payments/gateways';
import { consumeGuestCheckoutRateLimit, guestOrderCookieName, hashGuestOrderToken } from '@/lib/payments/guest-checkout';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationProvider } from '@/lib/notifications/service';

export const maxDuration = 30;

const requestSchema = z.object({
  order_id: z.string().uuid(),
  payment_id: z.string().uuid(),
});

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid payment status request.' }, 400);

  try {
    const admin = createAdminClient();
    const allowed = await consumeGuestCheckoutRateLimit(admin, request, 'mpesa-status', 120);
    if (!allowed) return json({ error: 'Too many status checks. Wait briefly and try again.' }, 429);

    const cookieStore = await cookies();
    const guestToken = cookieStore.get(guestOrderCookieName(parsed.data.order_id))?.value;
    if (!guestToken) return json({ error: 'This checkout has expired.' }, 401);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, order_number, status, payment_status, guest_access_token_hash')
      .eq('id', parsed.data.order_id)
      .eq('guest_access_token_hash', hashGuestOrderToken(guestToken))
      .maybeSingle();
    if (orderError || !order) return json({ error: 'Checkout could not be verified.' }, 404);

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select('id, status, provider_reference, provider_payload')
      .eq('id', parsed.data.payment_id)
      .eq('order_id', order.id)
      .eq('provider', 'mpesa')
      .maybeSingle();
    if (paymentError || !payment) return json({ error: 'Payment record was not found.' }, 404);

    if (payment.status === 'SUCCEEDED') {
      return json({
        status: 'PAID',
        orderStatus: order.status,
        orderNumber: order.order_number,
        fulfillable: order.status === 'CONFIRMED',
      });
    }
    if (payment.status === 'FAILED') {
      return json({ status: 'FAILED', orderNumber: order.order_number });
    }

    const payload = payment.provider_payload && typeof payment.provider_payload === 'object' && !Array.isArray(payment.provider_payload)
      ? payment.provider_payload
      : {};
    const reference = payment.provider_reference ?? (typeof payload.thirdPartyRef === 'string' ? payload.thirdPartyRef : null);
    if (!reference) return json({ error: 'Payment reference is not available yet. Check again shortly.' }, 202);

    const providerPayment = await new MpesaGateway().getPayment(reference);
    if (providerPayment.status === 'PAID') {
      const { data: canFulfill, error: completionError } = await admin.rpc('complete_guest_checkout_payment', {
        target_payment_id: payment.id,
      });
      if (completionError) return json({ error: 'Payment was received but order confirmation is still processing.' }, 202);

      await notificationProvider.dispatch({ kind: canFulfill ? 'ORDER_CONFIRMED' : 'PAYMENT_CONFIRMED', recordId: order.id });

      return json({
        status: 'PAID',
        orderStatus: canFulfill ? 'CONFIRMED' : 'CANCELLED',
        orderNumber: order.order_number,
        fulfillable: canFulfill === true,
      });
    }

    if (providerPayment.status === 'FAILED' || providerPayment.status === 'CANCELLED') {
      const { error: failureError } = await admin.rpc('fail_guest_checkout_payment', {
        target_payment_id: payment.id,
      });
      if (failureError) return json({ error: 'Payment declined; order cleanup is processing.' }, 202);
      return json({ status: providerPayment.status, orderStatus: 'CANCELLED', orderNumber: order.order_number });
    }

    return json({ status: providerPayment.status, orderNumber: order.order_number }, 202);
  } catch {
    return json({ error: 'MineScope has not returned a final status yet. Check again; do not start a duplicate payment.' }, 202);
  }
}
