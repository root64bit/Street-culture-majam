# Customer communications

Supabase Free remains the account/session/database provider. Twilio Email delivers branded authentication emails and newsletter emails; Twilio Verify delivers SMS codes. Spacemail remains the support inbox and is not replaced by Twilio.

## Production configuration

- Sender/reply inbox: `support@streetculturevault.com`.
- Supabase Send Email HTTPS hook: `https://www.streetculturevault.com/api/hooks/auth-email`. Enable only after the migration, environment variables and endpoint are deployed and tested. The handler verifies Standard Webhooks signatures and tracks provider acceptance without logging codes.
- Supabase Phone provider: Twilio Verify, with phone confirmation enabled. The Account SID, Auth Token and Verify Service SID are configured privately in Supabase; the full account token is not needed by Vercel.
- Vercel needs the communications variables documented in `.env.example`. The email key is restricted to sending/reading email operations. Never commit `.env*.local` or `.vercel` files.
- `node scripts/configure-communications.mjs <installed-vercel-cli-entrypoint>` uploads an explicit communications allowlist from the ignored production environment file. It refuses missing or `[SENSITIVE]` placeholder values and never echoes credentials.
- Apply `supabase/migrations/20261017160000_communications.sql` before enabling the new flows. Tables use RLS with no anonymous/customer grants. Campaign sending requires `settings.manage`.

## Customer flows

- Email/password sign-up can be confirmed with the code or link from the branded email. Existing customers can also sign in with an email code.
- Customers first sign in and verify a mobile number in Account. SMS login uses that linked number and does not automatically create a second account.
- Both phone forms use a searchable country/calling-code selector. A private, uncached `/api/location` response suggests the connection's country on Vercel; the browser region is a fallback, then Mozambique. Existing numbers and saved manual country choices take priority, and late suggestions never overwrite input. Only a country preference is stored locally—no GPS request, extra geolocation service, or stored phone number is involved. Local numbers and pasted international numbers are normalized to E.164 before authentication requests.
- International delivery depends on Twilio country permissions, local rules and carrier availability. Keep Fraud Guard enabled and monitor usage/costs in Twilio.
- WhatsApp login stays disabled until a business-owned sender is approved and linked to the Verify service. Do not migrate/delete an existing WhatsApp support number without a separate decision. Enabling a channel without a sender does not make it usable.

## Email marketing

The website footer collects separate, unchecked newsletter consent. A recipient must confirm the emailed link before receiving campaigns. Account creation and purchasing do not subscribe customers.

Create drafts at `/admin/marketing`. Sending requires an explicit checkbox and sends at most 10 recipients per click. Continue with **Send next batch / finish** until complete. No scheduled campaigns or automatic retries are enabled. Messages contain the supplied Johannesburg mailing address and authenticated unsubscribe links, including RFC 8058-style one-click headers.

An accepted operation means Twilio queued the message, not that it reached the inbox. Review Twilio email operations/logs for delivery and bounce status. Failed/skipped or uncertain sends are not automatically retried, avoiding duplicate campaigns after network interruptions. The screen distinguishes these totals; inspect uncertain sends before further action.

## Checks

- `pnpm exec vitest run tests/unit/communications.test.ts`
- `pnpm exec tsc --noEmit`
- Local SQL smoke test: pipe `tests/communications-migration.sql` to the local Supabase PostgreSQL container's `psql`. Fixtures are rolled back. It checks confirmed-only recipients, duplicate prevention and restricted database access.
- A public unsigned POST to the auth hook must return 401 once configured; it must never send mail.
- Test to an owner-controlled inbox/phone before customer use. Never send a marketing campaign as part of deployment verification.

If rolling back email delivery, disable the Supabase hook first so authentication is not left pointing to an unavailable endpoint. Keep signing keys and pending unsubscribe links stable across deployments.
