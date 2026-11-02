-- Future-order notifications only. No sends, bookings, scheduler or historical enrollment.
CREATE TABLE public.order_notification_channels (
 channel TEXT PRIMARY KEY CHECK(channel IN ('CUSTOMER_EMAIL','ADMIN_EMAIL','CUSTOMER_WHATSAPP')),
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 enabled_since TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(NOT enabled OR enabled_since IS NOT NULL)
);
INSERT INTO public.order_notification_channels(channel) VALUES ('CUSTOMER_EMAIL'),('ADMIN_EMAIL'),('CUSTOMER_WHATSAPP');
ALTER TABLE public.order_notification_channels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_notification_channels FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_notification_channels TO authenticated;
GRANT ALL ON public.order_notification_channels TO service_role;
CREATE POLICY "Communication managers see channel configuration" ON public.order_notification_channels
 FOR SELECT TO authenticated USING(public.has_capability('settings.manage'));

ALTER TABLE public.order_message_outbox
 DROP CONSTRAINT order_message_outbox_kind_check,
 DROP CONSTRAINT order_message_outbox_state_check,
 ADD COLUMN channel TEXT NOT NULL DEFAULT 'CUSTOMER_EMAIL' REFERENCES public.order_notification_channels(channel),
 ADD COLUMN lease_token UUID,
 ADD COLUMN lease_until TIMESTAMPTZ,
 ADD COLUMN next_check_at TIMESTAMPTZ,
 ADD COLUMN check_attempts INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN provider_status TEXT,
 ADD CONSTRAINT order_message_outbox_kind_check CHECK(kind IN ('ORDER_CONFIRMED','ORDER_SHIPPED','ORDER_DELIVERED','ADMIN_NEW_ORDER')),
 ADD CONSTRAINT order_message_outbox_state_check CHECK(state IN ('QUEUED','SENDING','ACCEPTED','DELIVERED','FAILED','UNDELIVERED','SKIPPED','UNKNOWN'));
CREATE INDEX order_message_work_queue ON public.order_message_outbox(channel,state,next_check_at,created_at);

CREATE TABLE public.order_notification_worker_health (
 id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id),
 last_started_at TIMESTAMPTZ,last_completed_at TIMESTAMPTZ,last_failed_at TIMESTAMPTZ
);
INSERT INTO public.order_notification_worker_health(id) VALUES(TRUE);
ALTER TABLE public.order_notification_worker_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_notification_worker_health FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.order_notification_worker_health TO service_role;
GRANT SELECT ON public.order_notification_worker_health TO authenticated;
CREATE POLICY "Communication managers see worker health" ON public.order_notification_worker_health
 FOR SELECT TO authenticated USING(public.has_capability('settings.manage'));

-- The old worker cannot bypass the new activation cutoff or send WhatsApp as email.
REVOKE ALL ON FUNCTION public.claim_order_email() FROM service_role;
CREATE OR REPLACE FUNCTION public.enqueue_paid_order_fulfillment() RETURNS TRIGGER
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.payment_status='PAID' AND NEW.status='CONFIRMED' AND (OLD.payment_status IS DISTINCT FROM NEW.payment_status OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF coalesce(NEW.shipping_method_snapshot->>'code','') NOT ILIKE '%PICKUP%' THEN
   INSERT INTO public.fulfillment_jobs(order_id,address_snapshot) VALUES(NEW.id,NEW.shipping_address_snapshot) ON CONFLICT(order_id,group_key) DO NOTHING;
  END IF;
  INSERT INTO public.order_message_outbox(order_id,kind,dedupe_key,channel) VALUES
   (NEW.id,'ORDER_CONFIRMED','confirmed:'||NEW.id,'CUSTOMER_EMAIL'),
   (NEW.id,'ADMIN_NEW_ORDER','admin-confirmed:'||NEW.id,'ADMIN_EMAIL') ON CONFLICT(dedupe_key) DO NOTHING;
  IF NEW.shipping_address_snapshot->>'whatsapp_updates_opt_in'='true'
   AND NEW.shipping_address_snapshot->>'whatsapp_consent_version'='whatsapp-order-v1'
   AND NEW.shipping_address_snapshot->>'whatsapp_phone' ~ '^\+[1-9][0-9]{6,14}$' THEN
   INSERT INTO public.order_message_outbox(order_id,kind,dedupe_key,channel)
   VALUES(NEW.id,'ORDER_CONFIRMED','whatsapp-confirmed:'||NEW.id,'CUSTOMER_WHATSAPP') ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;
 END IF;
 IF NEW.payment_status='PAID' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('SHIPPED','DELIVERED') THEN
  INSERT INTO public.order_message_outbox(order_id,kind,dedupe_key,channel)
  VALUES(NEW.id,'ORDER_'||NEW.status,lower(NEW.status::text)||':'||NEW.id,'CUSTOMER_EMAIL') ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION public.claim_order_message(target_channel TEXT) RETURNS SETOF public.order_message_outbox
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.order_message_outbox SET state='UNKNOWN',lease_token=NULL,lease_until=NULL,
  last_error='Send lease expired; verify provider outcome before any resend',updated_at=now()
  WHERE channel=target_channel AND state='SENDING' AND coalesce(lease_until,claimed_at+interval '3 minutes')<now();
 RETURN QUERY UPDATE public.order_message_outbox SET state='SENDING',claimed_at=now(),
  lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
 WHERE id=(SELECT m.id FROM public.order_message_outbox m
  JOIN public.order_notification_channels c ON c.channel=m.channel
  JOIN public.orders o ON o.id=m.order_id
  WHERE m.channel=target_channel AND c.enabled AND o.created_at>=c.enabled_since AND m.state='QUEUED'
  ORDER BY m.created_at,m.id FOR UPDATE OF m SKIP LOCKED LIMIT 1) RETURNING *;
END; $$;

CREATE FUNCTION public.finish_order_message(target_id UUID,target_lease UUID,outcome TEXT,provider_id TEXT DEFAULT NULL)
 RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF outcome NOT IN ('ACCEPTED','FAILED','SKIPPED','UNKNOWN') OR (outcome='ACCEPTED' AND length(coalesce(provider_id,'')) NOT BETWEEN 2 AND 160) THEN
  RAISE EXCEPTION 'Invalid notification outcome';
 END IF;
 UPDATE public.order_message_outbox SET state=outcome,operation_id=provider_id,
  provider_status=CASE WHEN outcome='ACCEPTED' THEN 'ACCEPTED' END,
  next_check_at=CASE WHEN outcome='ACCEPTED' THEN now()+interval '1 minute' END,
  last_error=CASE outcome WHEN 'UNKNOWN' THEN 'Provider outcome uncertain; verify before any resend'
   WHEN 'SKIPPED' THEN 'Order or recipient is no longer eligible' WHEN 'FAILED' THEN 'Provider rejected the message' END,
  lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE id=target_id AND lease_token=target_lease AND lease_until>now() AND state='SENDING';
 RETURN FOUND;
END; $$;

-- Receipt lookups are read-only at the provider and may safely be retried after a lease expires.
CREATE FUNCTION public.claim_order_message_receipt(target_channel TEXT) RETURNS SETOF public.order_message_outbox
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN QUERY UPDATE public.order_message_outbox SET lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',check_attempts=check_attempts+1
 WHERE id=(SELECT id FROM public.order_message_outbox WHERE channel=target_channel AND state='ACCEPTED'
  AND next_check_at<=now() AND (lease_until IS NULL OR lease_until<now())
  ORDER BY next_check_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
END; $$;

CREATE FUNCTION public.record_order_message_receipt(target_id UUID,target_lease UUID,outcome TEXT,target_provider_status TEXT)
 RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF outcome NOT IN ('ACCEPTED','DELIVERED','UNDELIVERED','FAILED','UNKNOWN') OR length(coalesce(target_provider_status,''))>80 THEN
  RAISE EXCEPTION 'Invalid receipt outcome';
 END IF;
 UPDATE public.order_message_outbox SET state=outcome,provider_status=target_provider_status,
  next_check_at=CASE WHEN outcome='ACCEPTED' THEN now()+least(60,greatest(2,check_attempts*5))*interval '1 minute' END,
  last_error=CASE WHEN outcome IN ('FAILED','UNDELIVERED','UNKNOWN') THEN 'Delivery needs operator review; no automatic resend' END,
  lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE id=target_id AND lease_token=target_lease AND lease_until>now() AND state='ACCEPTED';
 RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.claim_order_message(TEXT),public.finish_order_message(UUID,UUID,TEXT,TEXT),
 public.claim_order_message_receipt(TEXT),public.record_order_message_receipt(UUID,UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_message(TEXT),public.finish_order_message(UUID,UUID,TEXT,TEXT),
 public.claim_order_message_receipt(TEXT),public.record_order_message_receipt(UUID,UUID,TEXT,TEXT) TO service_role;

-- Idempotent scheduler installation is an explicit operator action, NOT a migration side effect.
-- pg_cron, pg_net and Vault must be verified/installed separately. A fixed production URL
-- prevents an arbitrary HTTP target. The dedicated worker secret stays out of cron SQL text.
CREATE FUNCTION public.wake_order_notifications() RETURNS BIGINT
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request_id BIGINT;worker_secret TEXT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.order_message_outbox m JOIN public.order_notification_channels c ON c.channel=m.channel
   JOIN public.orders o ON o.id=m.order_id WHERE
    (m.state='QUEUED' AND m.channel IN ('CUSTOMER_EMAIL','ADMIN_EMAIL') AND c.enabled AND o.created_at>=c.enabled_since)
    OR (m.state='ACCEPTED' AND m.next_check_at<=now() AND (m.lease_until IS NULL OR m.lease_until<now()))
    OR (m.state='SENDING' AND m.lease_until<now())) THEN RETURN NULL; END IF;
 -- Dynamic SQL lets isolated databases migrate without enabling network extensions.
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1' INTO worker_secret USING 'street_culture_order_worker';
 IF length(coalesce(worker_secret,''))<32 THEN RETURN NULL; END IF;
 EXECUTE 'SELECT net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=55000)' INTO request_id
 USING 'https://www.streetculturevault.com/api/cron/orders',
  jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),'{}'::jsonb;
 RETURN request_id;
END; $$;
REVOKE ALL ON FUNCTION public.wake_order_notifications() FROM PUBLIC,anon,authenticated,service_role;
