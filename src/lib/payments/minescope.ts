import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  PaymentGatewayUnavailableError,
  PaymentOutcomeUnknownError,
  type CreatePaymentInput,
  type ProviderPayment,
} from '@/lib/payments/types';

const DEFAULT_BASE_URL = 'https://minescoop-mz.web.app/api/mpesa';
const REQUEST_TIMEOUT_MS = 20_000;

const paymentResponseSchema = z.object({
  success: z.boolean(),
  transactionId: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  responseCode: z.string().optional(),
  responseDescription: z.string().optional(),
  thirdPartyRef: z.string().optional(),
});

const statusResponseSchema = paymentResponseSchema.extend({
  transactionStatus: z.string().optional(),
});

export type MineScopeReferences = {
  reference: string;
  thirdPartyRef: string;
};

export function makeMineScopeReferences(idempotencyKey: string): MineScopeReferences {
  const digest = createHash('sha256').update(idempotencyKey).digest('hex').toUpperCase();
  return {
    reference: `SC${digest.slice(0, 8)}`,
    thirdPartyRef: `ST${digest.slice(8, 16)}`,
  };
}

function getMineScopeBaseUrl() {
  if (process.env.MPESA_PAYMENTS_ENABLED !== 'true') {
    throw new PaymentGatewayUnavailableError('M-Pesa payments are not enabled for this store.');
  }

  const configured = process.env.MPESA_GATEWAY_BASE_URL || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new PaymentGatewayUnavailableError('The MineScope gateway URL is invalid.');
  }

  // This is the host documented in the merchant-provided MineScope PDF. Keeping
  // it pinned prevents a misconfigured environment variable becoming an SSRF.
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'minescoop-mz.web.app' ||
    url.pathname.replace(/\/$/, '') !== '/api/mpesa' ||
    url.search ||
    url.hash
  ) {
    throw new PaymentGatewayUnavailableError('The MineScope gateway URL is not an approved endpoint.');
  }

  return url.toString().replace(/\/$/, '');
}

async function post<T>(path: '/pay' | '/status', body: unknown, schema: z.ZodType<T>) {
  const baseUrl = getMineScopeBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // A network timeout may happen after MineScope accepted the request. Keep
    // the payment pending and query by the same thirdPartyRef; never retry /pay
    // with a new reference automatically.
    throw new PaymentOutcomeUnknownError();
  }

  const json = await response.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new PaymentOutcomeUnknownError();
  }
  return { response, data: parsed.data };
}

function normalizeMsisdn(phone: string) {
  const normalized = phone.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (!/^258(84|85)\d{7}$/.test(normalized)) {
    throw new Error('Enter a valid Mozambique M-Pesa number, including country code 258.');
  }
  return normalized;
}

export async function initiateMineScopePayment(input: CreatePaymentInput): Promise<ProviderPayment> {
  if (input.currency !== 'MZN' || !Number.isInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor % 100 !== 0) {
    throw new Error('M-Pesa requires a positive whole-MZN order amount.');
  }
  if (!input.customerPhone) {
    throw new Error('An M-Pesa phone number is required.');
  }

  const references = makeMineScopeReferences(input.idempotencyKey);
  const { response, data } = await post('/pay', {
    amount: input.amountMinor / 100,
    msisdn: normalizeMsisdn(input.customerPhone),
    reference: references.reference,
    thirdPartyRef: references.thirdPartyRef,
  }, paymentResponseSchema);

  if (response.status >= 500) throw new PaymentOutcomeUnknownError();

  if (!response.ok || !data.success) {
    if (data.responseCode === 'INS-25' || data.responseCode === 'INS-9') {
      // Duplicate/timeout responses are ambiguous; query the existing reference.
      return {
        provider: 'mpesa',
        providerReference: references.thirdPartyRef,
        status: 'PENDING',
        providerTransactionId: data.transactionId ?? undefined,
        conversationId: data.conversationId ?? undefined,
        responseCode: data.responseCode,
        responseDescription: data.responseDescription,
      };
    }
    throw new Error(data.responseDescription || 'MineScope could not start the M-Pesa request.');
  }

  // "success" here means the push request was accepted, not that the customer
  // entered a PIN or money reached the merchant.
  return {
    provider: 'mpesa',
    providerReference: references.thirdPartyRef,
    status: 'PENDING',
    providerTransactionId: data.transactionId ?? undefined,
    conversationId: data.conversationId ?? undefined,
    responseCode: data.responseCode,
    responseDescription: data.responseDescription,
  };
}

export async function getMineScopePayment(providerReference: string): Promise<ProviderPayment> {
  if (!/^ST[A-F0-9]{8}$/.test(providerReference)) {
    throw new Error('The MineScope payment reference is invalid.');
  }

  const { response, data } = await post('/status', {
    queryRef: providerReference,
    thirdPartyRef: providerReference,
  }, statusResponseSchema);

  if (!response.ok && !data.responseCode) {
    throw new Error('MineScope could not return the payment status.');
  }

  const transactionStatus = data.transactionStatus?.trim().toLowerCase();
  let status: ProviderPayment['status'] = 'PENDING';
  if (response.ok && data.success && data.responseCode === 'INS-0' && transactionStatus === 'completed') {
    status = 'PAID';
  } else if (['cancelled', 'canceled'].includes(transactionStatus ?? '') || data.responseCode === 'INS-5') {
    status = 'CANCELLED';
  } else if (['failed', 'rejected'].includes(transactionStatus ?? '')) {
    status = 'FAILED';
  } else if (['processing', 'pending', 'in progress'].includes(transactionStatus ?? '')) {
    status = 'PROCESSING';
  }

  return { provider: 'mpesa', providerReference, status };
}
