import 'server-only';
import { assertExternalServicesAllowed } from '@/lib/external-services';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  category?: 'authentication' | 'newsletter' | 'transactional';
};

export function emailIsConfigured() {
  return Boolean(
    process.env.TWILIO_EMAIL_FROM &&
    ((process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET) ||
      (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN))
  );
}

export async function sendEmail(message: EmailMessage) {
  assertExternalServicesAllowed();
  const username = process.env.TWILIO_API_KEY || process.env.TWILIO_ACCOUNT_SID;
  const password = process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_EMAIL_FROM;
  if (!username || !password || !from) throw new Error('Email delivery is not configured.');

  const response = await fetch('https://comms.twilio.com/v1/Emails', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { address: from, name: 'Street Culture' },
      to: [{ address: message.to }],
      content: { subject: message.subject, html: message.html, text: message.text },
      ...(message.headers ? { headers: message.headers } : {}),
      tags: { category: message.category || 'authentication' },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    // Provider responses can contain recipients and message contents.
    throw new Error(`Email provider returned HTTP ${response.status}.`);
  }
  const data = (await response.json()) as { operationId?: string };
  if (!data.operationId) throw new Error('Email provider returned an invalid response.');
  return data.operationId;
}

// One operation is created for one recipient by sendEmail. A completed operation
// is NOT delivery evidence: only explicit delivered/opened counts qualify.
export async function emailOperationStatus(operationId: string) {
  assertExternalServicesAllowed();
  if (!/^comms_operation_[0-9a-z]{26,35}$/.test(operationId))
    throw new Error('Invalid email operation reference.');
  const username = process.env.TWILIO_API_KEY || process.env.TWILIO_ACCOUNT_SID;
  const password = process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
  if (!username || !password) throw new Error('Email delivery is not configured.');
  const response = await fetch(`https://comms.twilio.com/v1/Emails/Operations/${operationId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('Email delivery status is unavailable.');
  return classifyEmailOperation(await response.json());
}

export function classifyEmailOperation(value: unknown): {
  outcome: 'ACCEPTED' | 'DELIVERED' | 'UNDELIVERED' | 'FAILED';
  providerStatus: string;
} {
  if (!value || typeof value !== 'object') throw new Error('Invalid email operation.');
  const data = value as { status?: unknown; stats?: Record<string, unknown> };
  if (
    typeof data.status !== 'string' ||
    !['SCHEDULED', 'PROCESSING', 'COMPLETED', 'CANCELED'].includes(data.status)
  )
    throw new Error('Invalid email operation.');
  const count = (key: string) => {
    const number = data.stats?.[key];
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0)
      throw new Error('Invalid email delivery counters.');
    return number;
  };
  if (count('delivered') > 0 || count('opened') > 0)
    return { outcome: 'DELIVERED', providerStatus: 'DELIVERED' };
  if (count('undelivered') > 0) return { outcome: 'UNDELIVERED', providerStatus: 'UNDELIVERED' };
  if (count('failed') > 0 || count('canceled') > 0 || data.status === 'CANCELED')
    return { outcome: 'FAILED', providerStatus: data.status };
  return { outcome: 'ACCEPTED', providerStatus: data.status };
}
