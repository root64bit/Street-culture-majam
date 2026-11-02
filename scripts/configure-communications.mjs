// Usage: node scripts/configure-communications.mjs /absolute/path/to/vercel/dist/index.js
// Reads only the communications allowlist; never uploads pulled [SENSITIVE] placeholders.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

const cli = process.argv[2];
if (!cli) throw new Error('Pass the installed Vercel CLI entry point.');
const env = parseEnv(readFileSync('.env.production.local', 'utf8'));
const names = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY',
  'TWILIO_API_SECRET',
  'TWILIO_EMAIL_FROM',
  'SUPABASE_SEND_EMAIL_HOOK_SECRET',
  'NEWSLETTER_SIGNING_SECRET',
  'MARKETING_POSTAL_ADDRESS',
  'NEXT_PUBLIC_SUPPORT_EMAIL',
  'NEXT_PUBLIC_EMAIL_OTP_ENABLED',
  'NEXT_PUBLIC_PHONE_OTP_ENABLED',
  'NEXT_PUBLIC_WHATSAPP_OTP_ENABLED',
  'NEXT_PUBLIC_NEWSLETTER_ENABLED',
];
for (const name of names) {
  const value = env[name];
  if (!value || value.includes('[SENSITIVE]'))
    throw new Error(`${name} is missing. No placeholder values are allowed.`);
}
for (const name of names) {
  const sensitive = /SECRET|API_KEY/.test(name);
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'env',
      'add',
      name,
      'production',
      '--force',
      '--yes',
      sensitive ? '--sensitive' : '--no-sensitive',
    ],
    { input: env[name], encoding: 'utf8', windowsHide: true }
  );
  // Do not echo CLI output or values: secrets must not enter logs.
  if (result.status !== 0) throw new Error(`Could not configure ${name}. Check Vercel access.`);
  console.log(`Configured ${name}`);
}
