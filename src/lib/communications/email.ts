import 'server-only';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  category?: 'authentication' | 'newsletter';
};

export function emailIsConfigured() {
  return Boolean(
    process.env.TWILIO_EMAIL_FROM &&
    ((process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET) ||
      (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN))
  );
}

export async function sendEmail(message: EmailMessage) {
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
