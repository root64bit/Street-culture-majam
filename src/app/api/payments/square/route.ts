import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { notificationProvider } from '@/lib/notifications/service';
import {
  consumeGuestCheckoutRateLimit,
  guestOrderCookieName,
  hashGuestOrderToken,
} from '@/lib/payments/guest-checkout';
import {
  createSquarePayment,
  SquareApiError,
  squareErrorMessage,
  squarePaymentSnapshot,
} from '@/lib/payments/square';
import { PaymentOutcomeUnknownError } from '@/lib/payments/types';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.types';

export const maxDuration = 30;

const requestSchema = z.object({
  order_id: z.string().uuid(),
  payment_id: z.string().uuid(),
  source_id: z.string().trim().min(1).max(2048),
});

type JsonObject = Record<string, Json | undefined>;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request) {
  if (process.env.SQUARE_PAYMENTS_ENABLED !== 'true') {
    return json({ error: 'Card and Apple Pay checkout are not enabled for this store.' }, 503);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid Square payment request.' }, 400);

  try {
    const admin = createAdminClient();
    const allowed = await consumeGuestCheckoutRateLimit(admin, request, 'square-payment', 20);
    if (!allowed)
      return json({ error: 'Too many payment attempts. Please wait and try again.' }, 429);

    const cookieStore = await cookies();
    const guestToken = cookieStore.get(guestOrderCookieName(parsed.data.order_id))?.value;
    if (!guestToken) return json({ error: 'This checkout has expired. Please start again.' }, 401);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select(
        'id, order_number, status, payment_status, total_amount, currency, guest_name, guest_email, guest_phone, guest_access_token_hash, shipping_address_snapshot, payment_expires_at'
      )
      .eq('id', parsed.data.order_id)
      .eq('guest_access_token_hash', hashGuestOrderToken(guestToken))
      .maybeSingle();
    if (orderError || !order) return json({ error: 'Checkout could not be verified.' }, 404);

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select('id, status, amount, currency, idempotency_key, provider_reference, provider_payload')
      .eq('id', parsed.data.payment_id)
      .eq('order_id', order.id)
      .eq('provider', 'square')
      .maybeSingle();
    if (paymentError || !payment?.idempotency_key) {
      return json({ error: 'Payment quote was not found. Return to checkout and try again.' }, 404);
    }
    if (payment.status === 'SUCCEEDED') {
      return json({
        status: 'PAID',
        orderNumber: order.order_number,
        orderStatus: order.status,
        fulfillable: order.status === 'CONFIRMED',
      });
    }
    if (payment.status === 'FAILED') {
      return json({ error: 'This payment attempt has ended. Please try again.' }, 409);
    }
    if (
      order.status !== 'PENDING' ||
      order.payment_status !== 'UNPAID' ||
      order.currency !== 'MZN' ||
      payment.currency !== 'GBP' ||
      !order.payment_expires_at ||
      Date.parse(order.payment_expires_at) <= Date.now()
    ) {
      return json({ error: 'This order is no longer available for payment.' }, 409);
    }
    if (payment.provider_reference || payment.status === 'REQUIRES_ACTION') {
      return json(
        {
          status: 'PROCESSING',
          orderNumber: order.order_number,
          message: 'This payment is already processing. Check its status instead of paying again.',
        },
        202
      );
    }

    const quotePayload = objectValue(payment.provider_payload);
    const amountMinor = Number(quotePayload.amountMinor);
    if (
      !Number.isSafeInteger(amountMinor) ||
      amountMinor < 1 ||
      Number(quotePayload.orderTotalMzn) !== Number(order.total_amount) ||
      Number(payment.amount) !== amountMinor / 100
    ) {
      return json({ error: 'The payment quote is invalid. Please contact the store.' }, 409);
    }

    const shipping = objectValue(order.shipping_address_snapshot);
    const { data: claimed, error: claimError } = await admin
      .from('payments')
      .update({ status: 'REQUIRES_ACTION' })
      .eq('id', payment.id)
      .eq('status', 'PENDING')
      .select('id')
      .maybeSingle();
    if (claimError) return json({ error: 'Payment could not be started. Please try again.' }, 503);
    if (!claimed) return json({ status: 'PROCESSING' }, 202);

    try {
      const squarePayment = await createSquarePayment({
        sourceId: parsed.data.source_id,
        idempotencyKey: payment.idempotency_key,
        amountMinor,
        currency: 'GBP',
        orderNumber: order.order_number,
        buyerEmail: optionalString(order.guest_email),
        paymentId: payment.id,
        buyerPhone: optionalString(order.guest_phone),
        shippingAddress: {
          address_line_1: optionalString(shipping.address_line_1),
          address_line_2: optionalString(shipping.address_line_2),
          administrative_district_level_1: optionalString(shipping.province),
          country: optionalString(shipping.country),
          locality: optionalString(shipping.city),
          postal_code: optionalString(shipping.postal_code),
        },
      });
      const snapshot = squarePaymentSnapshot(squarePayment);
      const { error: updateError } = await admin
        .from('payments')
        .update({
          provider_reference: squarePayment.id,
          provider_payload: { ...quotePayload, square: snapshot },
          last_provider_status: squarePayment.status,
          last_reconciled_at: new Date().toISOString(),
        })
        .eq('id', payment.id);
      if (updateError) {
        return json(
          { error: 'Payment was submitted but order confirmation is still processing.' },
          202
        );
      }

      const amountMatches =
        squarePayment.amount_money?.amount === amountMinor &&
        squarePayment.amount_money?.currency === 'GBP' &&
        squarePayment.reference_id === payment.id;
      if (squarePayment.status === 'COMPLETED' && amountMatches) {
        const { data: canFulfill, error: completionError } = await admin.rpc(
          'complete_square_checkout_payment',
          { target_payment_id: payment.id }
        );
        if (completionError) {
          return json(
            { error: 'Payment was received but order confirmation is still processing.' },
            202
          );
        }
        await notificationProvider.dispatch({
          kind: canFulfill ? 'ORDER_CONFIRMED' : 'PAYMENT_CONFIRMED',
          recordId: order.id,
        });
        return json({
          status: 'PAID',
          orderNumber: order.order_number,
          orderStatus: canFulfill ? 'CONFIRMED' : 'CANCELLED',
          fulfillable: canFulfill === true,
          receiptUrl: snapshot.receiptUrl,
        });
      }

      if (squarePayment.status === 'FAILED' || squarePayment.status === 'CANCELED') {
        await admin.rpc('fail_square_checkout_payment', { target_payment_id: payment.id });
        return json({ error: 'Square declined this payment. Try another payment method.' }, 402);
      }

      return json(
        {
          status: 'PROCESSING',
          orderNumber: order.order_number,
          message: 'Square is still processing the payment. Do not submit it again.',
        },
        202
      );
    } catch (error) {
      if (error instanceof SquareApiError) {
        const { error: failureError } = await admin.rpc('fail_square_checkout_payment', {
          target_payment_id: payment.id,
        });
        if (failureError) return json({ status: 'PROCESSING' }, 202);
        return json({ error: squareErrorMessage(error) }, 402);
      }
      if (error instanceof PaymentOutcomeUnknownError) {
        return json(
          {
            status: 'PROCESSING',
            orderNumber: order.order_number,
            message: 'The payment result is not final yet. Do not submit it again.',
          },
          202
        );
      }
      throw error;
    }
  } catch {
    return json({ error: 'Square checkout is temporarily unavailable. Please try again.' }, 503);
  }
}
