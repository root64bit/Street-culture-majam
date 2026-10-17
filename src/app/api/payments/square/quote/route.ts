import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchMznExchangeRates } from '@/lib/currency';
import {
  consumeGuestCheckoutRateLimit,
  guestOrderCookieName,
  hashGuestOrderToken,
} from '@/lib/payments/guest-checkout';
import { quoteMznInGbp } from '@/lib/payments/square-money';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

const requestSchema = z.object({ order_id: z.string().uuid() });

type QuotePayload = {
  amountMinor?: unknown;
  gbpPerMzn?: unknown;
  orderTotalMzn?: unknown;
  quoteExpiresAt?: unknown;
  rateUpdatedAt?: unknown;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function payloadObject(payload: unknown): QuotePayload {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as QuotePayload)
    : {};
}

function quoteResponse(
  order: {
    id: string;
    order_number: string;
    total_amount: number;
    payment_expires_at: string | null;
  },
  payment: { id: string; amount: number; provider_payload: unknown }
) {
  const payload = payloadObject(payment.provider_payload);
  const amountMinor = Number(payload.amountMinor);
  const gbpPerMzn = Number(payload.gbpPerMzn);
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    !Number.isFinite(gbpPerMzn) ||
    gbpPerMzn <= 0 ||
    Number(payload.orderTotalMzn) !== Number(order.total_amount)
  ) {
    return null;
  }

  return {
    paymentId: payment.id,
    orderId: order.id,
    orderNumber: order.order_number,
    totalMzn: Number(order.total_amount),
    amountMinor,
    amount: Number(payment.amount),
    currency: 'GBP',
    gbpPerMzn,
    rateUpdatedAt: typeof payload.rateUpdatedAt === 'string' ? payload.rateUpdatedAt : undefined,
    expiresAt:
      typeof payload.quoteExpiresAt === 'string'
        ? payload.quoteExpiresAt
        : order.payment_expires_at,
  };
}

export async function POST(request: Request) {
  if (process.env.SQUARE_PAYMENTS_ENABLED !== 'true') {
    return json({ error: 'Card and Apple Pay checkout are not enabled for this store.' }, 503);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid Square quote request.' }, 400);

  try {
    const admin = createAdminClient();
    const allowed = await consumeGuestCheckoutRateLimit(admin, request, 'square-quote', 30);
    if (!allowed)
      return json({ error: 'Too many payment attempts. Please wait and try again.' }, 429);

    const cookieStore = await cookies();
    const guestToken = cookieStore.get(guestOrderCookieName(parsed.data.order_id))?.value;
    if (!guestToken) return json({ error: 'This checkout has expired. Please start again.' }, 401);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select(
        'id, order_number, status, payment_status, total_amount, currency, guest_access_token_hash, payment_expires_at'
      )
      .eq('id', parsed.data.order_id)
      .eq('guest_access_token_hash', hashGuestOrderToken(guestToken))
      .maybeSingle();

    if (orderError || !order) return json({ error: 'Checkout could not be verified.' }, 404);
    if (
      order.status !== 'PENDING' ||
      order.payment_status !== 'UNPAID' ||
      order.currency !== 'MZN' ||
      !order.payment_expires_at ||
      Date.parse(order.payment_expires_at) <= Date.now()
    ) {
      return json({ error: 'This order is no longer available for payment.' }, 409);
    }

    const { data: activePayments, error: activePaymentError } = await admin
      .from('payments')
      .select('id, amount, provider_payload')
      .eq('order_id', order.id)
      .eq('provider', 'square')
      .in('status', ['PENDING', 'REQUIRES_ACTION'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (activePaymentError)
      return json({ error: 'Payment quote is temporarily unavailable.' }, 503);

    const activePayment = activePayments?.[0];
    if (activePayment) {
      const response = quoteResponse(order, activePayment);
      if (response) return json(response);
      return json(
        { error: 'The existing payment quote is invalid. Please contact the store.' },
        409
      );
    }

    const rateSnapshot = await fetchMznExchangeRates();
    const quote = quoteMznInGbp(Number(order.total_amount), rateSnapshot.rates);
    const quoteExpiresAt = order.payment_expires_at;
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        order_id: order.id,
        provider: 'square',
        idempotency_key: randomUUID(),
        provider_payload: {
          amountMinor: quote.amountMinor,
          gbpPerMzn: quote.gbpPerMzn,
          orderTotalMzn: Number(order.total_amount),
          quoteExpiresAt,
          rateSource: rateSnapshot.source,
          rateUpdatedAt: rateSnapshot.updatedAt,
        },
        status: 'PENDING',
        amount: quote.amount,
        currency: quote.currency,
      })
      .select('id, amount, provider_payload')
      .single();

    if (paymentError || !payment) {
      const { data: racedPayment } = await admin
        .from('payments')
        .select('id, amount, provider_payload')
        .eq('order_id', order.id)
        .eq('provider', 'square')
        .in('status', ['PENDING', 'REQUIRES_ACTION'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const racedResponse = racedPayment ? quoteResponse(order, racedPayment) : null;
      return racedResponse
        ? json(racedResponse)
        : json({ error: 'A payment quote is already being prepared. Please try again.' }, 409);
    }

    const response = quoteResponse(order, payment);
    return response ? json(response) : json({ error: 'Payment quote could not be prepared.' }, 503);
  } catch {
    return json(
      { error: 'Payment quote is temporarily unavailable. Please try again shortly.' },
      503
    );
  }
}
