import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeGuestCheckoutRateLimit, guestOrderCookieName, hashGuestOrderToken } from '@/lib/payments/guest-checkout';
import { makeMineScopeReferences } from '@/lib/payments/minescope';
import { MpesaGateway } from '@/lib/payments/gateways';
import { PaymentOutcomeUnknownError } from '@/lib/payments/types';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

const requestSchema = z.object({
  order_id: z.string().uuid(),
  phone: z.string().trim().regex(/^(?:\+?258)?(?:84|85)\d{7}$/),
});

function normalizeMozambiquePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('258') ? digits : `258${digits}`;
}

export async function POST(request: Request) {
  if (process.env.MPESA_PAYMENTS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'M-Pesa checkout is not enabled for this store.' }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid Mozambique M-Pesa phone number.' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const allowed = await consumeGuestCheckoutRateLimit(admin, request, 'mpesa-initiate', 6);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many payment attempts. Please wait before trying again.' }, { status: 429 });
    }

    const cookieStore = await cookies();
    const guestToken = cookieStore.get(guestOrderCookieName(parsed.data.order_id))?.value;
    if (!guestToken) {
      return NextResponse.json({ error: 'This checkout has expired. Please start again.' }, { status: 401 });
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, order_number, status, payment_status, total_amount, currency, guest_phone, guest_access_token_hash, payment_expires_at')
      .eq('id', parsed.data.order_id)
      .eq('guest_access_token_hash', hashGuestOrderToken(guestToken))
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Checkout could not be verified. Please start again.' }, { status: 404 });
    }
    if (
      order.status !== 'PENDING' ||
      !['UNPAID', 'FAILED'].includes(order.payment_status) ||
      order.currency !== 'MZN' ||
      !order.payment_expires_at ||
      Date.parse(order.payment_expires_at) <= Date.now()
    ) {
      return NextResponse.json({ error: 'This order is no longer available for payment.' }, { status: 409 });
    }
    if (normalizeMozambiquePhone(parsed.data.phone) !== order.guest_phone) {
      return NextResponse.json({ error: 'Use the M-Pesa number entered for this checkout.' }, { status: 400 });
    }

    const { data: existingPayment, error: existingPaymentError } = await admin
      .from('payments')
      .select('id, status, provider_reference, provider_payload')
      .eq('order_id', order.id)
      .eq('provider', 'mpesa')
      .in('status', ['PENDING', 'REQUIRES_ACTION'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPaymentError) {
      return NextResponse.json({ error: 'Payment status is temporarily unavailable. Please try again.' }, { status: 503 });
    }
    if (existingPayment) {
      return NextResponse.json({
        orderId: order.id,
        orderNumber: order.order_number,
        paymentId: existingPayment.id,
        status: existingPayment.status === 'REQUIRES_ACTION' ? 'PENDING' : 'PROCESSING',
        message: 'A request is already active for this order. Check your phone; we will not send a duplicate push.',
      }, { status: 202 });
    }

    const idempotencyKey = randomUUID();
    const references = makeMineScopeReferences(idempotencyKey);
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        order_id: order.id,
        provider: 'mpesa',
        provider_reference: references.thirdPartyRef,
        idempotency_key: idempotencyKey,
        provider_payload: references,
        status: 'PENDING',
        amount: order.total_amount,
        currency: order.currency,
      })
      .select('id, idempotency_key')
      .single();

    if (paymentError || !payment?.idempotency_key) {
      return NextResponse.json({ error: 'A payment request is already being prepared. Check your phone shortly.' }, { status: 409 });
    }

    try {
      const result = await new MpesaGateway().createPayment({
        orderId: order.id,
        amountMinor: Math.round(Number(order.total_amount) * 100),
        currency: order.currency,
        idempotencyKey: payment.idempotency_key,
        customerPhone: normalizeMozambiquePhone(parsed.data.phone),
      });

      await admin
        .from('payments')
        .update({
          provider_reference: result.providerReference,
          provider_payload: {
            ...references,
            providerTransactionId: result.providerTransactionId ?? null,
            conversationId: result.conversationId ?? null,
            responseCode: result.responseCode ?? null,
            responseDescription: result.responseDescription ?? null,
          },
          status: 'REQUIRES_ACTION',
        })
        .eq('id', payment.id);

      return NextResponse.json({
        orderId: order.id,
        orderNumber: order.order_number,
        paymentId: payment.id,
        status: 'PENDING',
        message: 'M-Pesa request sent. Check your phone and approve it with your M-Pesa PIN.',
      }, { status: 202 });
    } catch (error) {
      const uncertain = error instanceof PaymentOutcomeUnknownError;
      if (!uncertain) {
        await admin.rpc('fail_guest_checkout_payment', { target_payment_id: payment.id });
      }
      return NextResponse.json({
        orderId: order.id,
        orderNumber: order.order_number,
        paymentId: payment.id,
        status: uncertain ? 'PROCESSING' : 'FAILED',
        message: uncertain
          ? 'The request may have reached MineScope. We are checking the same reference; do not retry the payment yet.'
          : 'MineScope could not start the payment request. No payment was marked complete.',
      }, { status: uncertain ? 202 : 502 });
    }
  } catch {
    return NextResponse.json({ error: 'M-Pesa checkout is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
}
