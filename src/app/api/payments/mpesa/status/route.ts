import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MpesaGateway } from '@/lib/payments/gateways';
import {
  consumeGuestCheckoutRateLimit,
  guestOrderCookieName,
  hashGuestOrderToken,
} from '@/lib/payments/guest-checkout';
import { getMpesaInstallmentProgress } from '@/lib/payments/mpesa-installments';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationProvider } from '@/lib/notifications/service';
import { PaymentStatusUnavailableError } from '@/lib/payments/types';

export const maxDuration = 75;

const requestSchema = z.object({
  order_id: z.string().uuid(),
  payment_id: z.string().uuid().optional(),
});

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid payment status request.' }, 400);

  try {
    const admin = createAdminClient();
    const allowed = await consumeGuestCheckoutRateLimit(admin, request, 'mpesa-status', 600);
    if (!allowed)
      return json({ error: 'Too many status checks. Wait briefly and try again.' }, 429);

    const cookieStore = await cookies();
    const guestToken = cookieStore.get(guestOrderCookieName(parsed.data.order_id))?.value;
    if (!guestToken) return json({ error: 'This checkout has expired.' }, 401);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, order_number, status, payment_status, total_amount, guest_access_token_hash')
      .eq('id', parsed.data.order_id)
      .eq('guest_access_token_hash', hashGuestOrderToken(guestToken))
      .maybeSingle();
    if (orderError || !order) return json({ error: 'Checkout could not be verified.' }, 404);

    // Recover an uncertain initiation using only an authenticated status lookup.
    // This works after reservation expiry and never creates a new wallet push.
    let paymentQuery = admin
      .from('payments')
      .select('id, status, provider_reference, provider_payload')
      .eq('order_id', order.id)
      .eq('provider', 'mpesa');
    if (parsed.data.payment_id) paymentQuery = paymentQuery.eq('id', parsed.data.payment_id);
    const { data: payment, error: paymentError } = await paymentQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw new PaymentStatusUnavailableError();
    if (!payment) {
      if (parsed.data.payment_id) return json({ error: 'Payment record was not found.' }, 404);
      return json(
        {
          status: 'PROCESSING',
          reason: 'PAYMENT_RECORD_PENDING',
          orderNumber: order.order_number,
          message:
            'The payment request has not been located yet. Check status again or contact support before trying another payment.',
        },
        202
      );
    }

    const loadProgress = async () => {
      const { data: orderPayments, error: progressError } = await admin
        .from('payments')
        .select('amount, status')
        .eq('order_id', order.id)
        .eq('provider', 'mpesa');
      if (progressError) throw new Error('M-Pesa installment progress is unavailable.');
      return getMpesaInstallmentProgress(Number(order.total_amount), orderPayments ?? []);
    };

    if (payment.status === 'SUCCEEDED') {
      const progress = await loadProgress();
      if (progress.remainingAmount > 0) {
        return json({
          status: 'PARTIALLY_PAID',
          orderNumber: order.order_number,
          ...progress,
          message: `Installment confirmed. ${progress.remainingAmount.toLocaleString('en-US')} MZN remains.`,
        });
      }
      return json({
        status: 'PAID',
        orderStatus: order.status,
        orderNumber: order.order_number,
        fulfillable: order.status === 'CONFIRMED',
        ...progress,
      });
    }
    if (payment.status === 'FAILED') {
      const progress = await loadProgress();
      return json({
        status: progress.paidAmount > 0 ? 'INSTALLMENT_FAILED' : 'FAILED',
        orderNumber: order.order_number,
        partial: progress.paidAmount > 0,
        ...progress,
      });
    }

    const payload =
      payment.provider_payload &&
      typeof payment.provider_payload === 'object' &&
      !Array.isArray(payment.provider_payload)
        ? payment.provider_payload
        : {};
    const reference =
      payment.provider_reference ??
      (typeof payload.thirdPartyRef === 'string' ? payload.thirdPartyRef : null);
    if (!reference)
      return json({ error: 'Payment reference is not available yet. Check again shortly.' }, 202);

    const providerPayment = await new MpesaGateway().getPayment(reference);
    if (providerPayment.status === 'PAID') {
      const { data: canFulfill, error: completionError } = await admin.rpc(
        'complete_guest_checkout_payment',
        {
          target_payment_id: payment.id,
        }
      );
      if (completionError)
        return json(
          { error: 'Payment was received but order confirmation is still processing.' },
          202
        );

      const progress = await loadProgress();
      if (progress.remainingAmount > 0) {
        return json({
          status: 'PARTIALLY_PAID',
          orderStatus: 'PENDING',
          orderNumber: order.order_number,
          fulfillable: false,
          ...progress,
          message: `Installment confirmed. Continue with ${progress.nextInstallmentAmount.toLocaleString('en-US')} MZN.`,
        });
      }

      await notificationProvider.dispatch({
        kind: canFulfill ? 'ORDER_CONFIRMED' : 'PAYMENT_CONFIRMED',
        recordId: order.id,
      });

      return json({
        status: 'PAID',
        orderStatus: canFulfill ? 'CONFIRMED' : 'CANCELLED',
        orderNumber: order.order_number,
        fulfillable: canFulfill === true,
        ...progress,
      });
    }

    if (providerPayment.status === 'FAILED' || providerPayment.status === 'CANCELLED') {
      const { error: failureError } = await admin.rpc('fail_guest_checkout_payment', {
        target_payment_id: payment.id,
      });
      if (failureError)
        return json({ error: 'Payment declined; order cleanup is processing.' }, 202);
      const progress = await loadProgress();
      if (progress.paidAmount > 0) {
        return json({
          status: 'INSTALLMENT_FAILED',
          orderStatus: 'PENDING',
          orderNumber: order.order_number,
          partial: true,
          ...progress,
          message:
            'This installment was not completed. Earlier confirmed installments remain recorded.',
        });
      }
      return json({
        status: providerPayment.status,
        orderStatus: 'CANCELLED',
        orderNumber: order.order_number,
        ...progress,
      });
    }

    return json({ status: providerPayment.status, orderNumber: order.order_number }, 202);
  } catch (error) {
    if (error instanceof PaymentStatusUnavailableError) {
      return json(
        {
          status: 'PROCESSING',
          reason: 'PROVIDER_UNAVAILABLE',
          message:
            'M-Pesa’s confirmation service is temporarily unavailable. We cannot confirm whether this payment completed. Check status again later; do not pay again. No new payment request was sent by this status check.',
        },
        202
      );
    }
    return json(
      {
        error:
          'MineScope has not returned a final status yet. Check again; do not start a duplicate payment.',
      },
      202
    );
  }
}
