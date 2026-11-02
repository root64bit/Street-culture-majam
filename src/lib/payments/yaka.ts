import 'server-only';

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertExternalServicesAllowed } from '@/lib/external-services';
import { MPESA_MAX_TRANSACTION_MZN } from '@/lib/payments/mpesa-installments';
import { normalizeMpesaPhone } from '@/lib/payments/mpesa-phone';
import {
  PaymentGatewayUnavailableError,
  PaymentOutcomeUnknownError,
  PaymentStatusUnavailableError,
  type CreatePaymentInput,
  type ProviderPayment,
} from '@/lib/payments/types';

const ORIGIN = 'https://yaka-mpesa-gateway.vercel.app';
const HOST = 'yaka-mpesa-gateway.vercel.app';
const ENVIRONMENT = 'production';
const initiationPath = '/v1/c2b/single-stage';
const statusPath = '/v1/transactions/status';
const readinessPath = '/v1/readiness';
type GatewayPath = typeof initiationPath | typeof statusPath | typeof readinessPath;

const initiationSchema = z.object({
  environment: z.literal(ENVIRONMENT),
  replayed: z.boolean().optional(),
  data: z.object({
    accepted: z.boolean(),
    final: z.boolean(),
    uncertain: z.boolean(),
    thirdPartyReference: z.string(),
    rawHttpStatus: z.number().int(),
    responseCode: z.string().nullable(),
    responseDescription: z.string().nullable().optional(),
    transactionId: z.string().nullable().optional(),
    conversationId: z.string().nullable().optional(),
    errorCode: z.string().nullable(),
  }),
});
const statusSchema = z.object({
  environment: z.literal(ENVIRONMENT),
  data: z.object({
    success: z.boolean(),
    transactionStatus: z.string().nullable().optional(),
    responseCode: z.string().nullable(),
    responseDescription: z.string().nullable().optional(),
    conversationId: z.string().nullable().optional(),
    transactionId: z.string().nullable().optional(),
    errorCode: z.string().nullable().optional(),
  }),
});

function configuration() {
  assertExternalServicesAllowed();
  const secret = process.env.MPESA_GATEWAY_SHARED_SECRET?.trim();
  const timeout = Number(process.env.MPESA_GATEWAY_REQUEST_TIMEOUT_MS || 20000);
  if (
    process.env.MPESA_PAYMENTS_ENABLED !== 'true' ||
    process.env.MPESA_GATEWAY_URL !== ORIGIN ||
    process.env.MPESA_GATEWAY_EXPECTED_HOST !== HOST ||
    process.env.MPESA_GATEWAY_ENV !== ENVIRONMENT ||
    !secret ||
    secret.length < 32 ||
    !Number.isInteger(timeout) ||
    timeout < 1000 ||
    timeout > 60000
  ) {
    throw new PaymentGatewayUnavailableError(
      'The M-Pesa gateway is not configured for this store.'
    );
  }
  return { secret, timeout };
}

async function post(path: GatewayPath, input: unknown) {
  const { secret, timeout } = configuration();
  const body = JSON.stringify(input);
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = createHmac('sha256', secret)
    .update(`v2.POST.${path}.${timestamp}.${nonce}.${body}`, 'utf8')
    .digest('hex');
  try {
    const response = await fetch(ORIGIN + path, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-YAKA-Gateway-Timestamp': timestamp,
        'X-YAKA-Gateway-Nonce': nonce,
        'X-YAKA-Gateway-Signature': signature,
      },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    });
    const payload: unknown = await response.json();
    if (!response.ok && !(path === initiationPath && response.status === 422)) throw new Error();
    return { response, payload };
  } catch {
    // Once /single-stage may have been sent, only reconciliation is safe.
    // Never retry it here, change references, or fall back to the old gateway.
    if (path === initiationPath) throw new PaymentOutcomeUnknownError();
    if (path === statusPath) throw new PaymentStatusUnavailableError();
    throw new PaymentGatewayUnavailableError('The M-Pesa gateway readiness check is unavailable.');
  }
}

export function makeYakaReferences(idempotencyKey: string) {
  if (!idempotencyKey) throw new Error('An M-Pesa attempt key is required.');
  const digest = createHash('sha256').update(idempotencyKey).digest('hex').toUpperCase();
  // Namespace distinguishes Street Culture attempts from other projects and
  // historical MineScope STxxxxxxxx references, without changing stored IDs.
  return {
    reference: `SCMP${digest.slice(0, 16)}`,
    thirdPartyRef: `SCMP${digest.slice(0, 32)}`,
  };
}

export function makeYakaPaymentRequest(input: CreatePaymentInput) {
  if (
    input.currency !== 'MZN' ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0
  ) {
    throw new Error('M-Pesa requires a positive MZN amount with at most two decimal places.');
  }
  if (input.amountMinor > MPESA_MAX_TRANSACTION_MZN * 100) {
    throw new Error(`M-Pesa accepts at most ${MPESA_MAX_TRANSACTION_MZN} MZN per transaction.`);
  }
  const phone = normalizeMpesaPhone(input.customerPhone || '');
  if (!phone) throw new Error('Enter a valid Mozambique M-Pesa number.');
  const references = makeYakaReferences(input.idempotencyKey);
  // Integer arithmetic avoids binary float rounding and always sends two digits.
  const amount = `${Math.floor(input.amountMinor / 100)}.${String(input.amountMinor % 100).padStart(2, '0')}`;
  return {
    transactionReference: references.reference,
    customerMsisdn: phone,
    amount,
    thirdPartyReference: references.thirdPartyRef,
  };
}

export async function assertYakaReady() {
  const { payload } = await post(readinessPath, {});
  const result = z
    .object({
      environment: z.literal(ENVIRONMENT),
      ok: z.literal(true),
      liveChargesArmed: z.literal(true),
    })
    .safeParse(payload);
  if (!result.success)
    throw new PaymentGatewayUnavailableError('M-Pesa is not ready to accept payments.');
  return result.data;
}

export async function initiateYakaPayment(input: CreatePaymentInput): Promise<ProviderPayment> {
  const request = makeYakaPaymentRequest(input);
  const { response, payload } = await post(initiationPath, request);
  const parsed = initiationSchema.safeParse(payload);
  if (!parsed.success || parsed.data.data.thirdPartyReference !== request.thirdPartyReference) {
    throw new PaymentOutcomeUnknownError();
  }
  const { data, replayed } = parsed.data;
  const result = {
    provider: 'mpesa' as const,
    providerReference: request.thirdPartyReference,
    providerTransactionId: data.transactionId || undefined,
    conversationId: data.conversationId || undefined,
    responseCode: data.responseCode || undefined,
    responseDescription: data.responseDescription || undefined,
    errorCode: data.errorCode || undefined,
    rawHttpStatus: data.rawHttpStatus,
  };
  const validHttp = response.status === 201 || (response.status === 200 && replayed === true);
  if (
    validHttp &&
    data.accepted &&
    !data.final &&
    !data.uncertain &&
    data.responseCode === 'INS-0' &&
    data.transactionId &&
    data.conversationId &&
    [200, 201].includes(data.rawHttpStatus)
  ) {
    // Acceptance is NEVER settlement, even with INS-0 and provider IDs.
    return { ...result, status: 'PENDING' };
  }
  if (
    (response.status === 422 || (response.status === 200 && replayed === true)) &&
    data.rawHttpStatus >= 400 &&
    data.rawHttpStatus < 500 &&
    !data.accepted &&
    data.final &&
    !data.uncertain &&
    !['INS-9', 'INS-10', 'INS-23'].includes(data.responseCode || '')
  ) {
    return { ...result, status: 'FAILED' };
  }
  return { ...result, status: 'PROCESSING' };
}

export async function getYakaPayment(providerReference: string): Promise<ProviderPayment> {
  if (!/^SCMP[A-F0-9]{32}$/.test(providerReference)) throw new PaymentStatusUnavailableError();
  const { payload } = await post(statusPath, {
    queryRef: providerReference,
    thirdPartyRef: providerReference,
  });
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) throw new PaymentStatusUnavailableError();
  const { data } = parsed.data;
  const paid =
    data.success &&
    data.responseCode === 'INS-0' &&
    data.transactionStatus?.trim().toLowerCase() === 'completed';
  return {
    provider: 'mpesa',
    providerReference,
    status: paid ? 'PAID' : 'PROCESSING',
    providerTransactionId: data.transactionId || undefined,
    conversationId: data.conversationId || undefined,
    responseCode: data.responseCode || undefined,
    responseDescription: data.responseDescription || undefined,
    errorCode: data.errorCode || undefined,
  };
}
