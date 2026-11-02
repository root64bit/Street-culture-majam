BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_email_deliveries (
  id text PRIMARY KEY,
  payload_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  operation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auth_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_email_deliveries FROM anon, authenticated;
GRANT ALL ON public.auth_email_deliveries TO service_role;

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'subscribed', 'unsubscribed')),
  confirmation_hash text,
  confirmation_expires_at timestamptz,
  consent_version text NOT NULL DEFAULT 'newsletter-2026-10-17',
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_subscribers FROM anon, authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_confirmation_hash_idx ON public.newsletter_subscribers(confirmation_hash) WHERE confirmation_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL CHECK (length(subject) BETWEEN 3 AND 150),
  body text NOT NULL CHECK (length(body) BETWEEN 20 AND 12000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  send_started_at timestamptz,
  sent_at timestamptz
);
ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_campaigns FROM anon, authenticated;
GRANT ALL ON public.newsletter_campaigns TO service_role;

CREATE TABLE IF NOT EXISTS public.newsletter_deliveries (
  campaign_id uuid NOT NULL REFERENCES public.newsletter_campaigns(id),
  subscriber_id uuid NOT NULL REFERENCES public.newsletter_subscribers(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'failed')),
  operation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, subscriber_id)
);
ALTER TABLE public.newsletter_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_deliveries FROM anon, authenticated;
GRANT ALL ON public.newsletter_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_newsletter_batch(target_campaign_id uuid)
RETURNS TABLE(subscriber_id uuid, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE campaign public.newsletter_campaigns;
BEGIN
  SELECT * INTO campaign FROM public.newsletter_campaigns WHERE id = target_campaign_id FOR UPDATE;
  IF NOT FOUND OR campaign.status = 'sent' THEN RETURN; END IF;
  IF campaign.send_started_at IS NULL THEN
    UPDATE public.newsletter_campaigns SET status = 'sending', send_started_at = now()
      WHERE id = target_campaign_id RETURNING * INTO campaign;
  END IF;
  RETURN QUERY WITH candidates AS (
    SELECT s.id FROM public.newsletter_subscribers s
    WHERE s.status = 'subscribed' AND s.confirmed_at <= campaign.send_started_at
      AND NOT EXISTS (SELECT 1 FROM public.newsletter_deliveries d WHERE d.campaign_id = target_campaign_id AND d.subscriber_id = s.id)
    ORDER BY s.created_at LIMIT 10
  ), claimed AS (
    INSERT INTO public.newsletter_deliveries(campaign_id, subscriber_id)
    SELECT target_campaign_id, c.id FROM candidates c
    ON CONFLICT DO NOTHING RETURNING newsletter_deliveries.subscriber_id
  ) SELECT s.id, s.email FROM claimed c JOIN public.newsletter_subscribers s ON s.id = c.subscriber_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_newsletter_batch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_batch(uuid) TO service_role;

COMMIT;
