import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  consumeGuestCheckoutRateLimit,
  guestOrderCookieName,
  hashGuestOrderToken,
} from '@/lib/payments/guest-checkout';
import { assertYakaReady, makeYakaPaymentRequest, makeYakaReferences } from '@/lib/payments/yaka';
import { MpesaGateway } from '@/lib/payments/gateways';
import { getMpesaInstallmentProgress } from '@/lib/payments/mpesa-installments';
import { PaymentOutcomeUnknownError } from '@/lib/payments/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { moneyMinor, mpesaAmountEligible } from '@/lib/money';
import { normalizeMpesaPhone } from '@/lib/payments/mpesa-phone';

export const maxDuration = 150;

const requestSchema = z.object({
  order_id: z.string().uuid(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+?258)?(?:84|85)\d{7}$/),
});

export async function POST(request: Request) {
  if (process.env.MPESA_PAYMENTS_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'M-Pesa checkout is not enabled for this store.' },
      { status: 503 }
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Enter a valid Mozambique M-Pesa phone number.' },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const allowed = await consumeGuestCheckoutRateLimit(admin, request, 'mpesa-initiate', 30);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many payment attempts. Please wait before trying again.' },
        { status: 429 }
      );
    }

    const cookieStore = await cookies();
    const guestToken = cookieStore.get(guestOrderCookieName(parsed.data.order_id))?.value;
    if (!guestToken) {
      return NextResponse.json(
        { error: 'This checkout has expired. Please start again.' },
        { status: 401 }
      );
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select(
        'id, order_number, status, payment_status, total_amount, currency, guest_phone, guest_access_token_hash, payment_expires_at'
      )
      .eq('id', parsed.data.order_id)
      .eq('guest_access_token_hash', hashGuestOrderToken(guestToken))
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Checkout could not be verified. Please start again.' },
        { status: 404 }
      );
    }
    if (
      order.status !== 'PENDING' ||
      !['UNPAID', 'AUTHORIZED', 'FAILED'].includes(order.payment_status) ||
      order.currency !== 'MZN' ||
      !order.payment_expires_at ||
      Date.parse(order.payment_expires_at) <= Date.now()
    ) {
      return NextResponse.json(
        { error: 'This order is no longer available for payment.' },
        { status: 409 }
      );
    }
    if (!mpesaAmountEligible(Number(order.total_amount))) {
      return NextResponse.json(
        {
          error:
            'Enter a positive MZN total with at most two decimal places. No amount was rounded or charged.',
        },
        { status: 422 }
      );
    }
    const { data: payments, error: existingPaymentError } = await admin
      .from('payments')
      .select('id, status, amount, provider_reference, provider_payload, created_at')
      .eq('order_id', order.id)
      .eq('provider', 'mpesa')
      .order('created_at', { ascending: false });

    if (existingPaymentError) {
      return NextResponse.json(
        { error: 'Payment status is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }
    const walletPhone = normalizeMpesaPhone(parsed.data.phone)!;
    // Checkout ownership is authenticated above. The payer may differ from the
    // delivery contact, but retries/installments stay bound to the first wallet.
    // Legacy payment records predate payerPhone and used the order contact.
    const walletChanged = (payments ?? []).some((payment) => {
      const payload = payment.provider_payload;
      const stored =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? payload.payerPhone
          : null;
      return (
        normalizeMpesaPhone(typeof stored === 'string' ? stored : order.guest_phone || '') !==
        walletPhone
      );
    });
    if (walletChanged)
      return NextResponse.json(
        {
          error:
            'Use the same M-Pesa wallet that started this order payment. Contact support if you need help.',
        },
        { status: 400 }
      );
    const progress = getMpesaInstallmentProgress(Number(order.total_amount), payments ?? []);
    const existingPayment = payments?.find((payment) =>
      ['PENDING', 'REQUIRES_ACTION'].includes(payment.status)
    );
    if (existingPayment) {
      const payload =
        existingPayment.provider_payload &&
        typeof existingPayment.provider_payload === 'object' &&
        !Array.isArray(existingPayment.provider_payload)
          ? existingPayment.provider_payload
          : {};
      return NextResponse.json(
        {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentId: existingPayment.id,
          status: existingPayment.status === 'REQUIRES_ACTION' ? 'PENDING' : 'PROCESSING',
          ...progress,
          installmentAmount: Number(existingPayment.amount),
          installmentNumber:
            typeof payload.installmentNumber === 'number'
              ? payload.installmentNumber
              : progress.installmentNumber,
          message:
            'A request is already active for this order. Check your phone; we will not send a duplicate push.',
        },
        { status: 202 }
      );
    }
    if (progress.remainingAmount === 0) {
      return NextResponse.json(
        {
          orderId: order.id,
          orderNumber: order.order_number,
          status: 'PROCESSING',
          ...progress,
          error: 'All installments are recorded and the order confirmation is still processing.',
        },
        { status: 409 }
      );
    }

    // Fail closed on a missing credential or unavailable durable gateway store,
    // before creating an attempt. Existing attempts above remain status-only.
    await assertYakaReady();
    const idempotencyKey = randomUUID();
    const references = makeYakaReferences(idempotencyKey);
    const paymentInput = {
      orderId: order.id,
      amountMinor: moneyMinor(progress.nextInstallmentAmount),
      currency: order.currency,
      idempotencyKey,
      customerPhone: walletPhone,
    };
    const installmentMetadata = {
      payerPhone: walletPhone,
      installmentAmount: progress.nextInstallmentAmount,
      installmentNumber: progress.installmentNumber,
      installmentCount: progress.installmentCount,
      orderTotal: progress.totalAmount,
      gateway: 'yaka-owned-v1',
      environment: 'production',
      request: makeYakaPaymentRequest(paymentInput),
    };
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        order_id: order.id,
        provider: 'mpesa',
        provider_reference: references.thirdPartyRef,
        idempotency_key: idempotencyKey,
        provider_payload: { ...references, ...installmentMetadata },
        status: 'PENDING',
        amount: progress.nextInstallmentAmount,
        currency: order.currency,
      })
      .select('id, idempotency_key')
      .single();

    if (paymentError || !payment?.idempotency_key) {
      return NextResponse.json(
        { error: 'A payment request is already being prepared. Check your phone shortly.' },
        { status: 409 }
      );
    }

    try {
      if (payment.idempotency_key !== idempotencyKey) throw new PaymentOutcomeUnknownError();
      const result = await new MpesaGateway().createPayment(paymentInput);

      const { error: updateError } = await admin
        .from('payments')
        .update({
          provider_reference: result.providerReference,
          provider_payload: {
            ...references,
            ...installmentMetadata,
            providerTransactionId: result.providerTransactionId ?? null,
            conversationId: result.conversationId ?? null,
            responseCode: result.responseCode ?? null,
            responseDescription: result.responseDescription ?? null,
            errorCode: result.errorCode ?? null,
            rawHttpStatus: result.rawHttpStatus ?? null,
          },
          status: result.status === 'PENDING' ? 'REQUIRES_ACTION' : 'PENDING',
        })
        .eq('id', payment.id)
        .eq('status', 'PENDING');
      if (updateError) throw new PaymentOutcomeUnknownError();
      if (result.status === 'FAILED' || result.status === 'CANCELLED') {
        const { error: failureError } = await admin.rpc('fail_guest_checkout_payment', {
          target_payment_id: payment.id,
        });
        if (failureError) throw new PaymentOutcomeUnknownError();
        return NextResponse.json(
          {
            orderId: order.id,
            orderNumber: order.order_number,
            paymentId: payment.id,
            status: 'FAILED',
            ...progress,
            installmentAmount: progress.nextInstallmentAmount,
            partial: progress.paidAmount > 0,
            message:
              'M-Pesa declined this request. No payment was marked complete. Earlier confirmed installments remain recorded.',
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentId: payment.id,
          status: result.status === 'PENDING' ? 'PENDING' : 'PROCESSING',
          ...progress,
          installmentAmount: progress.nextInstallmentAmount,
          message:
            result.status !== 'PENDING'
              ? 'The payment outcome is not confirmed. We are checking the same reference; do not send another payment.'
              : progress.installmentCount > 1
                ? `M-Pesa installment ${progress.installmentNumber} of ${progress.installmentCount} sent. Approve ${progress.nextInstallmentAmount.toLocaleString('en-US')} MZN on your phone.`
                : 'M-Pesa request sent. Check your phone and approve it with your M-Pesa PIN.',
        },
        { status: 202 }
      );
    } catch {
      // The attempt exists and a debit may already have been submitted. Only an
      // explicit final provider rejection above may release inventory. Database
      // errors after acceptance are just as ambiguous as transport timeouts.
      return NextResponse.json(
        {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentId: payment.id,
          status: 'PROCESSING',
          ...progress,
          installmentAmount: progress.nextInstallmentAmount,
          partial: progress.paidAmount > 0,
          message:
            'The request may have reached M-Pesa. We are checking the same reference; do not retry the payment yet.',
        },
        { status: 202 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'M-Pesa checkout is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }
}
