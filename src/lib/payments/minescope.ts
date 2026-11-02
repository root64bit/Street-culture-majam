import 'server-only';

import { z } from 'zod';
import { assertExternalServicesAllowed } from '@/lib/external-services';
import {
  PaymentGatewayUnavailableError,
  PaymentStatusUnavailableError,
  type ProviderPayment,
} from '@/lib/payments/types';

const DEFAULT_BASE_URL = 'https://minescoop-mz.web.app/api/mpesa';
// The merchant's API documentation allows up to 60 seconds for the gateway.
// Route deadlines include a buffer for persisting/querying the same reference.
const REQUEST_TIMEOUT_MS = 60_000;

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

// Retained only for status reconciliation of historical STxxxxxxxx attempts.
function getMineScopeBaseUrl() {
  assertExternalServicesAllowed();
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
    throw new PaymentGatewayUnavailableError(
      'The MineScope gateway URL is not an approved endpoint.'
    );
  }

  return url.toString().replace(/\/$/, '');
}

async function post<T>(path: '/status', body: unknown, schema: z.ZodType<T>) {
  const baseUrl = getMineScopeBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Historical attempts remain unresolved when the old provider is unavailable.
    throw new PaymentStatusUnavailableError();
  }

  // Even a well-formed error response is not evidence that a wallet payment
  // failed. Never release inventory or allow another push on a gateway outage.
  if (path === '/status' && response.status >= 500) throw new PaymentStatusUnavailableError();

  const json = await response.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new PaymentStatusUnavailableError();
  }
  return { response, data: parsed.data };
}

export async function getMineScopePayment(providerReference: string): Promise<ProviderPayment> {
  if (!/^ST[A-F0-9]{8}$/.test(providerReference)) {
    throw new Error('The MineScope payment reference is invalid.');
  }

  const { response, data } = await post(
    '/status',
    {
      queryRef: providerReference,
      thirdPartyRef: providerReference,
    },
    statusResponseSchema
  );

  if (!response.ok && !data.responseCode) {
    throw new PaymentStatusUnavailableError();
  }

  const transactionStatus = data.transactionStatus?.trim().toLowerCase();
  let status: ProviderPayment['status'] = 'PENDING';
  if (
    response.ok &&
    data.success &&
    data.responseCode === 'INS-0' &&
    transactionStatus === 'completed'
  ) {
    status = 'PAID';
  } else if (
    ['cancelled', 'canceled'].includes(transactionStatus ?? '') ||
    data.responseCode === 'INS-5'
  ) {
    status = 'CANCELLED';
  } else if (['failed', 'rejected'].includes(transactionStatus ?? '')) {
    status = 'FAILED';
  } else if (['processing', 'pending', 'in progress'].includes(transactionStatus ?? '')) {
    status = 'PROCESSING';
  }

  return { provider: 'mpesa', providerReference, status };
}
