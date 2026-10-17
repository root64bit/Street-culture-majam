import 'server-only';

import { z } from 'zod';
import { PaymentGatewayUnavailableError, PaymentOutcomeUnknownError } from '@/lib/payments/types';

const SQUARE_API_VERSION = '2026-09-16';
const SQUARE_API_ORIGIN = 'https://connect.squareup.com';
const REQUEST_TIMEOUT_MS = 20_000;

const squareErrorSchema = z.object({
  errors: z
    .array(
      z.object({
        code: z.string().optional(),
        category: z.string().optional(),
        detail: z.string().optional(),
      })
    )
    .optional(),
});

const squarePaymentSchema = z.object({
  payment: z.object({
    id: z.string(),
    reference_id: z.string().optional(),
    status: z.string(),
    receipt_url: z.string().url().optional(),
    amount_money: z.object({ amount: z.number().int(), currency: z.string() }).optional(),
    card_details: z
      .object({
        card: z
          .object({
            card_brand: z.string().optional(),
            last_4: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
});

export type SquarePayment = z.infer<typeof squarePaymentSchema>['payment'];

export class SquareApiError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string
  ) {
    super(message);
    this.name = 'SquareApiError';
  }
}

function squareConfig() {
  if (process.env.SQUARE_PAYMENTS_ENABLED !== 'true') {
    throw new PaymentGatewayUnavailableError('Card and Apple Pay payments are not enabled.');
  }
  if (process.env.SQUARE_ENVIRONMENT !== 'production') {
    throw new PaymentGatewayUnavailableError('Square is not configured for production.');
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!accessToken || !locationId) {
    throw new PaymentGatewayUnavailableError('Square production credentials are incomplete.');
  }
  return { accessToken, locationId };
}

async function squareRequest(path: `/v2/payments${string}`, init?: RequestInit) {
  const { accessToken } = squareConfig();
  let response: Response;
  try {
    response = await fetch(`${SQUARE_API_ORIGIN}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Square-Version': SQUARE_API_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init?.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PaymentOutcomeUnknownError();
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 500 || response.status === 409) {
      throw new PaymentOutcomeUnknownError();
    }
    const parsed = squareErrorSchema.safeParse(json);
    const first = parsed.success ? parsed.data.errors?.[0] : undefined;
    throw new SquareApiError(
      first?.code ?? 'SQUARE_REQUEST_FAILED',
      response.status,
      first?.detail ?? 'Square could not process this payment.'
    );
  }
  return json;
}

export async function createSquarePayment(input: {
  sourceId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: 'GBP';
  orderNumber: string;
  paymentId: string;
  buyerEmail?: string;
  buyerPhone?: string;
  shippingAddress: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    administrative_district_level_1?: string;
    postal_code?: string;
    country?: string;
  };
}) {
  const { locationId } = squareConfig();
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new Error('Square requires a positive amount in pence.');
  }
  if (!/^[a-zA-Z0-9_-]{1,45}$/.test(input.idempotencyKey)) {
    throw new Error('The Square idempotency key is invalid.');
  }

  const json = await squareRequest('/v2/payments', {
    method: 'POST',
    body: JSON.stringify({
      source_id: input.sourceId,
      idempotency_key: input.idempotencyKey,
      amount_money: { amount: input.amountMinor, currency: input.currency },
      autocomplete: true,
      location_id: locationId,
      reference_id: input.paymentId,
      note: `Street Culture order ${input.orderNumber}`,
      buyer_email_address: input.buyerEmail,
      buyer_phone_number:
        input.buyerPhone && /^\+?[1-9]\d{6,14}$/.test(input.buyerPhone)
          ? `+${input.buyerPhone.replace(/^\+/, '')}`
          : undefined,
      shipping_address: input.shippingAddress,
      customer_details: { customer_initiated: true, seller_keyed_in: false },
    }),
  });
  const parsed = squarePaymentSchema.safeParse(json);
  if (!parsed.success) throw new PaymentOutcomeUnknownError();
  return parsed.data.payment;
}

export async function getSquarePayment(providerReference: string) {
  if (!/^[A-Za-z0-9_-]{8,192}$/.test(providerReference)) {
    throw new Error('The Square payment reference is invalid.');
  }
  const json = await squareRequest(`/v2/payments/${providerReference}`);
  const parsed = squarePaymentSchema.safeParse(json);
  if (!parsed.success) throw new PaymentOutcomeUnknownError();
  return parsed.data.payment;
}

// Recover a provider ID after a network timeout without replaying a charge.
export async function findSquarePayment(paymentId: string, createdAt: string) {
  const { locationId } = squareConfig();
  // Bound recovery to one provider request so cron and status checks meet their
  // deadlines. A missing match remains pending for operator review.
  const query = new URLSearchParams({
    location_id: locationId,
    begin_time: new Date(Date.parse(createdAt) - 60_000).toISOString(),
    sort_order: 'DESC',
    limit: '100',
  });
  const result = z
    .object({
      payments: z.array(squarePaymentSchema.shape.payment).optional(),
    })
    .parse(await squareRequest(`/v2/payments?${query}`));
  return result.payments?.find((payment) => payment.reference_id === paymentId) ?? null;
}

export function squarePaymentSnapshot(payment: SquarePayment) {
  return {
    squareStatus: payment.status,
    amountMinor: payment.amount_money?.amount ?? null,
    currency: payment.amount_money?.currency ?? null,
    receiptUrl: payment.receipt_url ?? null,
    cardBrand: payment.card_details?.card?.card_brand ?? null,
    cardLast4: payment.card_details?.card?.last_4 ?? null,
  };
}

export function squareErrorMessage(error: unknown) {
  if (!(error instanceof SquareApiError)) {
    return 'Square could not confirm the payment. Check the payment status before trying again.';
  }
  const messages: Record<string, string> = {
    CARD_DECLINED: 'The card was declined. Use another card or contact your bank.',
    CVV_FAILURE: 'The card security code was not accepted.',
    ADDRESS_VERIFICATION_FAILURE: 'The billing address or postal code was not accepted.',
    BAD_EXPIRATION: 'The card expiration date was not accepted.',
    INSUFFICIENT_FUNDS: 'The card has insufficient funds.',
    CARD_DECLINED_VERIFICATION_REQUIRED:
      'Your bank requires additional verification. Retry and complete the verification prompt.',
    PAYMENT_LIMIT_EXCEEDED: 'This payment exceeds the card or merchant processing limit.',
    TRANSACTION_LIMIT: 'The card issuer rejected this payment amount.',
  };
  return messages[error.code] ?? 'Square could not process this payment. Try another card.';
}
