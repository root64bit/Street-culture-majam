// Read-only operation permission check. Never sends email or prints recipients.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
const env = {
  ...parseEnv(readFileSync('.env.local', 'utf8')),
  ...parseEnv(readFileSync('.env.production.local', 'utf8')),
};
try {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (new URL(url).hostname !== 'tysibniisuobzpmnhwkf.supabase.co')
    throw new Error('Unexpected project');
  const raw = execFileSync(
    process.env.SC_SUPABASE_CLI || 'supabase',
    [
      'db',
      'query',
      '--linked',
      '--output',
      'json',
      'SELECT operation_id FROM public.auth_email_deliveries WHERE operation_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const operation = JSON.parse(raw).rows?.[0]?.operation_id;
  if (typeof operation !== 'string' || !/^comms_operation_[0-9a-z]{26,35}$/.test(operation))
    throw new Error('No valid existing operation available');
  const response = await fetch('https://comms.twilio.com/v1/Emails/Operations/' + operation, {
    headers: {
      Authorization:
        'Basic ' + Buffer.from(env.TWILIO_API_KEY + ':' + env.TWILIO_API_SECRET).toString('base64'),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    let reason = typeof failure.message === 'string' ? failure.message : '';
    for (const value of [env.TWILIO_ACCOUNT_SID, env.TWILIO_API_KEY, env.TWILIO_API_SECRET])
      if (value) reason = reason.replaceAll(value, '[redacted]');
    reason = reason.replace(/[\w.+-]+@[\w.-]+/g, '[email]').slice(0, 300);
    console.log(JSON.stringify({ providerReason: reason }));
    console.log(
      JSON.stringify({
        status: response.status,
        errorCode: typeof failure.code === 'number' ? failure.code : null,
      })
    );
    throw new Error('Operation lookup returned HTTP ' + response.status);
  }
  const body = await response.json();
  console.log(
    JSON.stringify({
      operationReadPermission: true,
      providerStatus: body.status,
      existingMessageDelivered: Number(body.stats?.delivered) > 0 || Number(body.stats?.opened) > 0,
      credentialsLogged: false,
      messagesSent: 0,
    })
  );
} catch (error) {
  console.error(
    error instanceof Error && error.message && !('details' in error)
      ? error.message
      : 'Provider read verification failed; no private details logged.'
  );
  process.exitCode = 1;
}
