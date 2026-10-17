-- Local-only smoke test. All fixtures are rolled back.
BEGIN;
INSERT INTO public.newsletter_campaigns(subject, body) VALUES('Test campaign', 'Local rollback-only campaign message.') RETURNING id AS campaign_id \gset
INSERT INTO public.newsletter_subscribers(email, status, confirmed_at) VALUES('consent-test@example.invalid', 'subscribed', now() - interval '1 minute');
INSERT INTO public.newsletter_subscribers(email, status) VALUES('pending-test@example.invalid', 'pending');
SELECT count(*) = 1 AS claims_only_confirmed FROM public.claim_newsletter_batch(:'campaign_id');
SELECT count(*) = 0 AS never_claims_twice FROM public.claim_newsletter_batch(:'campaign_id');
SELECT has_table_privilege('anon', 'public.newsletter_subscribers', 'SELECT') = false AS anonymous_cannot_read;
SELECT has_function_privilege('authenticated', 'public.claim_newsletter_batch(uuid)', 'EXECUTE') = false AS customers_cannot_send;
ROLLBACK;
