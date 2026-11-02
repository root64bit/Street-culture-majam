import { completeSandboxSession, getSandboxSession } from '@/lib/payments/payfast-sandbox-store';
import { confirmSandboxItn, constantTimeEqual, parseItn, payfastSignature, sandboxConfig,
  sandboxEnabled, SANDBOX_AMOUNT_MINOR, SANDBOX_ITEM_NAME, SANDBOX_REFERENCE, tokenHash,
  validSandboxSender, zarMinor } from '@/lib/payments/payfast-sandbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(message: string, status: number) {
  return new Response(message, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' } });
}

async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Body required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw new Error('Body too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function POST(request: Request) {
  if (!sandboxEnabled()) return reply('Sandbox disabled', 503);
  if (!validSandboxSender(request)) return reply('Invalid notification source', 403);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded')
    return reply('Unsupported content type', 415);
  let config;
  try { config = sandboxConfig(); } catch { return reply('Sandbox unavailable', 503); }
  let notification;
  try { notification = parseItn(await boundedBody(request)); } catch { return reply('Invalid notification', 400); }
  const { fields, entries } = notification;
  if (fields.merchant_id !== config.merchantId ||
      !constantTimeEqual(fields.signature, payfastSignature(entries, config.passphrase, true)))
    return reply('Invalid notification signature', 403);
  // Only one-off COMPLETE notifications apply to this tool. No subscriptions.
  if (fields.payment_status !== 'COMPLETE') return reply('Unsupported test notification status', 400);
  let gross: number, fee: number, net: number;
  try {
    gross = zarMinor(fields.amount_gross);
    fee = -zarMinor(fields.amount_fee, true);
    net = zarMinor(fields.amount_net);
    if (gross !== SANDBOX_AMOUNT_MINOR || fee < 0 || fee + net !== gross || fields.item_name !== SANDBOX_ITEM_NAME)
      throw new Error('Mismatch.');
  } catch { return reply('Notification amount or item mismatch', 400); }
  try {
    const id = SANDBOX_REFERENCE.exec(fields.m_payment_id)![1];
    const session = await getSandboxSession(id);
    const hash = tokenHash(fields.custom_str1);
    if (!session || session.amount_minor !== gross || !constantTimeEqual(session.callback_token_hash, hash))
      return reply('Unknown Sandbox payment', 403);
    // Includes all notification fields, including blank values, in original order.
    if (!await confirmSandboxItn(entries)) return reply('Sandbox server validation failed', 403);
    await completeSandboxSession({ target_session: id, target_provider: fields.pf_payment_id,
      target_gross: gross, target_fee: fee, target_net: net, target_token_hash: hash });
    return reply('Sandbox notification recorded', 200);
  } catch {
    // Never acknowledge a lost write or uncertain validation; allow PayFast retry.
    return reply('Sandbox notification temporarily unavailable', 503);
  }
}
