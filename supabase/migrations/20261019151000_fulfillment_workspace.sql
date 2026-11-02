-- Durable drafts and evidence-backed manual operations. No courier calls or historical backfill.
INSERT INTO public.role_capabilities(role,capability)
SELECT role,'shipping.prepare' FROM unnest(ARRAY['SUPER_ADMIN','ADMIN','OPERATIONS','FULFILLMENT']::public.app_role[]) role ON CONFLICT DO NOTHING;
INSERT INTO public.role_capabilities(role,capability)
SELECT role,'shipping.book' FROM unnest(ARRAY['SUPER_ADMIN','ADMIN','OPERATIONS']::public.app_role[]) role ON CONFLICT DO NOTHING;

CREATE TABLE public.fulfillment_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 group_key TEXT NOT NULL DEFAULT 'OUTBOUND' CHECK(length(group_key) BETWEEN 1 AND 80),UNIQUE(order_id,group_key),
 state TEXT NOT NULL DEFAULT 'REVIEW' CHECK(state IN ('REVIEW','READY','BOOKING_PENDING','BOOKING_UNKNOWN','BOOKED','AWAITING_COLLECTION','COLLECTED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','EXCEPTION','CANCELLED')),
 revision INTEGER NOT NULL DEFAULT 1,address_snapshot JSONB NOT NULL,origin_snapshot JSONB NOT NULL DEFAULT '{}',
 parcels JSONB NOT NULL DEFAULT '[]',address_confirmed BOOLEAN NOT NULL DEFAULT FALSE,origin_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
 packed_confirmed BOOLEAN NOT NULL DEFAULT FALSE,approved_at TIMESTAMPTZ,approved_by UUID REFERENCES public.profiles(id),
 approved_cost_mzn NUMERIC(12,2) CHECK(approved_cost_mzn>=0),
 provider_reference TEXT UNIQUE,tracking_url TEXT,document_reference TEXT,
 courier_cost NUMERIC(12,2),courier_currency TEXT CHECK(courier_currency IN ('MZN','ZAR','GBP','USD','EUR')),
 courier_mzn_per_unit NUMERIC(24,12),collection_reference TEXT,
 lease_token UUID,lease_until TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(parcels)='array'),CHECK(courier_cost IS NULL OR courier_cost>=0),
 CHECK(courier_mzn_per_unit IS NULL OR courier_mzn_per_unit>0)
);
CREATE TABLE public.fulfillment_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),job_id UUID NOT NULL REFERENCES public.fulfillment_jobs(id),
 event_key TEXT NOT NULL UNIQUE,event_type TEXT NOT NULL,public_message TEXT NOT NULL,
 evidence_reference TEXT,created_by UUID REFERENCES public.profiles(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.order_message_outbox (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES public.orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('ORDER_CONFIRMED','ORDER_SHIPPED','ORDER_DELIVERED')),
 dedupe_key TEXT NOT NULL UNIQUE,state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','SENDING','ACCEPTED','DELIVERED','FAILED','UNKNOWN')),
 operation_id TEXT,claimed_at TIMESTAMPTZ,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fulfillment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_message_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shipping operators see jobs" ON public.fulfillment_jobs FOR SELECT TO authenticated USING(public.has_capability('shipping.read'));
CREATE POLICY "Shipping operators see evidence" ON public.fulfillment_events FOR SELECT TO authenticated USING(public.has_capability('shipping.read'));
CREATE POLICY "Operators see message status" ON public.order_message_outbox FOR SELECT TO authenticated USING(public.has_capability('orders.read'));
REVOKE ALL ON public.fulfillment_jobs,public.fulfillment_events,public.order_message_outbox FROM anon,authenticated;
GRANT SELECT ON public.fulfillment_jobs,public.fulfillment_events,public.order_message_outbox TO authenticated;
GRANT ALL ON public.fulfillment_jobs,public.fulfillment_events,public.order_message_outbox TO service_role;
CREATE INDEX fulfillment_state_queue ON public.fulfillment_jobs(state,updated_at);

CREATE FUNCTION public.enqueue_paid_order_fulfillment() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.payment_status='PAID' AND NEW.status='CONFIRMED' AND (OLD.payment_status IS DISTINCT FROM NEW.payment_status OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF coalesce(NEW.shipping_method_snapshot->>'code','') NOT ILIKE '%PICKUP%' THEN
   INSERT INTO public.fulfillment_jobs(order_id,address_snapshot) VALUES(NEW.id,NEW.shipping_address_snapshot) ON CONFLICT(order_id,group_key) DO NOTHING;
  END IF;
  INSERT INTO public.order_message_outbox(order_id,kind,dedupe_key) VALUES(NEW.id,'ORDER_CONFIRMED','confirmed:'||NEW.id) ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('SHIPPED','DELIVERED') THEN
  INSERT INTO public.order_message_outbox(order_id,kind,dedupe_key) VALUES(NEW.id,'ORDER_'||NEW.status,lower(NEW.status::text)||':'||NEW.id) ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER enqueue_paid_order_fulfillment AFTER UPDATE OF status,payment_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_paid_order_fulfillment();
REVOKE ALL ON FUNCTION public.enqueue_paid_order_fulfillment() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.fulfillment_address_ready(a JSONB) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM unnest(ARRAY['name','phone','address_line_1','local_area','city','province','postal_code','country']) k WHERE length(btrim(coalesce(a->>k,'')))=0)
 AND coalesce(a->>'country','') ~ '^[A-Z]{2}$'
 AND coalesce(a->>'phone','') ~ '^\+?[0-9 ()-]{7,25}$'
 AND (a->>'country'<>'ZA' OR (a->>'province' IN ('Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape') AND a->>'postal_code' ~ '^[0-9]{4}$'));
$$;
REVOKE ALL ON FUNCTION public.fulfillment_address_ready(JSONB) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.fulfillment_operate(target_order_id UUID,operation TEXT,payload JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE;j public.fulfillment_jobs%ROWTYPE;note TEXT;next_state TEXT; p JSONB;
BEGIN
 IF NOT public.has_capability('shipping.prepare') THEN RAISE EXCEPTION 'Shipping permission required' USING ERRCODE='42501'; END IF;
 note:=btrim(payload->>'note');
 IF length(coalesce(note,'')) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Evidence note required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target_order_id::text,0));
 SELECT * INTO o FROM public.orders WHERE id=target_order_id FOR UPDATE;
 IF NOT FOUND OR o.payment_status<>'PAID' OR o.status IN ('CANCELLED','REFUNDED','DELIVERED') THEN RAISE EXCEPTION 'Paid open order required'; END IF;
 IF EXISTS(SELECT 1 FROM public.checkout_payment_holds WHERE order_id=o.id AND resolved_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.order_refund_requests WHERE order_id=o.id AND status IN ('REQUESTED','UNDER_REVIEW','RECORDED'))
 OR EXISTS(SELECT 1 FROM public.payments WHERE order_id=o.id AND reconciliation_needs_review) THEN RAISE EXCEPTION 'Order has an unresolved financial hold'; END IF;
 IF coalesce(o.shipping_method_snapshot->>'code','') ILIKE '%PICKUP%' THEN RAISE EXCEPTION 'Pickup orders do not require courier booking'; END IF;
 IF operation='PREPARE' THEN
  IF (payload->>'ship_approved') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirm this order should physically ship'; END IF;
  INSERT INTO public.fulfillment_jobs(order_id,address_snapshot) VALUES(o.id,o.shipping_address_snapshot) ON CONFLICT(order_id,group_key) DO NOTHING;
 END IF;
 SELECT * INTO j FROM public.fulfillment_jobs WHERE order_id=o.id AND group_key='OUTBOUND' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prepare an explicitly approved fulfillment draft first'; END IF;
 IF operation<>'PREPARE' AND (payload->>'revision')::integer IS DISTINCT FROM j.revision THEN RAISE EXCEPTION 'Shipment changed; refresh before continuing'; END IF;
 IF operation='SAVE' THEN
  IF j.state NOT IN ('REVIEW','READY','EXCEPTION') OR j.provider_reference IS NOT NULL THEN RAISE EXCEPTION 'Booked shipment cannot be edited'; END IF;
  IF NOT public.fulfillment_address_ready(payload->'address') OR NOT public.fulfillment_address_ready(payload->'origin') THEN RAISE EXCEPTION 'Confirm complete collection and delivery addresses'; END IF;
  IF jsonb_typeof(payload->'parcels')<>'array' OR jsonb_array_length(payload->'parcels') NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Actual parcels required'; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(payload->'parcels') LOOP
   IF NOT coalesce((p->>'submitted_length_cm')::numeric BETWEEN 0.01 AND 300 AND (p->>'submitted_width_cm')::numeric BETWEEN 0.01 AND 300 AND (p->>'submitted_height_cm')::numeric BETWEEN 0.01 AND 300 AND (p->>'submitted_weight_kg')::numeric BETWEEN 0.001 AND 1000,FALSE) THEN RAISE EXCEPTION 'Invalid parcel measurements'; END IF;
  END LOOP;
  IF (payload->>'address_confirmed') IS DISTINCT FROM 'true' OR (payload->>'origin_confirmed') IS DISTINCT FROM 'true' OR (payload->>'packed_confirmed') IS DISTINCT FROM 'true' OR o.fulfillment_status<>'PACKED' THEN RAISE EXCEPTION 'Pack the goods and confirm both addresses first'; END IF;
  UPDATE public.fulfillment_jobs SET address_snapshot=payload->'address',origin_snapshot=payload->'origin',parcels=payload->'parcels',
   address_confirmed=TRUE,origin_confirmed=TRUE,packed_confirmed=TRUE,state='READY',revision=revision+1,approved_at=NULL,approved_by=NULL,approved_cost_mzn=NULL,updated_at=now() WHERE id=j.id;
 ELSIF operation='APPROVE' THEN
  IF NOT public.has_capability('shipping.book') THEN RAISE EXCEPTION 'Booking approval permission required' USING ERRCODE='42501'; END IF;
  IF j.state<>'READY' OR o.fulfillment_status<>'PACKED' OR NOT j.address_confirmed OR NOT j.origin_confirmed OR NOT j.packed_confirmed THEN RAISE EXCEPTION 'Ready packed shipment required'; END IF;
  IF NOT coalesce((payload->>'max_cost_mzn')::numeric>=0,FALSE) THEN RAISE EXCEPTION 'Explicit courier cost limit required'; END IF;
  UPDATE public.fulfillment_jobs SET approved_at=now(),approved_by=auth.uid(),approved_cost_mzn=(payload->>'max_cost_mzn')::numeric,revision=revision+1,updated_at=now() WHERE id=j.id;
 ELSIF operation='IMPORT_BOOKING' THEN
  IF NOT public.has_capability('shipping.book') THEN RAISE EXCEPTION 'Booking permission required' USING ERRCODE='42501'; END IF;
  IF j.state<>'READY' OR j.approved_at IS NULL OR o.fulfillment_status<>'PACKED' THEN RAISE EXCEPTION 'Approve the ready shipment first'; END IF;
  IF length(btrim(coalesce(payload->>'provider_reference',''))) NOT BETWEEN 3 AND 128 OR length(btrim(coalesce(payload->>'document_reference',''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Courier and label evidence references required'; END IF;
  IF NOT coalesce(payload->>'courier_currency' IN ('MZN','ZAR','GBP','USD','EUR') AND (payload->>'courier_cost')::numeric>=0 AND (payload->>'courier_mzn_per_unit')::numeric>0 AND (payload->>'courier_currency'<>'MZN' OR (payload->>'courier_mzn_per_unit')::numeric=1),FALSE) THEN RAISE EXCEPTION 'Verified courier invoice and exchange rate required'; END IF;
  IF j.approved_cost_mzn IS NULL OR round((payload->>'courier_cost')::numeric*(payload->>'courier_mzn_per_unit')::numeric,2)>j.approved_cost_mzn THEN RAISE EXCEPTION 'Courier charge exceeds approved cost; obtain a new approval'; END IF;
  IF coalesce(payload->>'tracking_url','')<>'' AND payload->>'tracking_url' !~ '^https://(portal\.|www\.)?internetexpress\.co\.za(/|$)' THEN RAISE EXCEPTION 'Unapproved tracking host'; END IF;
  UPDATE public.fulfillment_jobs SET state='BOOKED',provider_reference=btrim(payload->>'provider_reference'),tracking_url=nullif(payload->>'tracking_url',''),document_reference=payload->>'document_reference',
   courier_cost=(payload->>'courier_cost')::numeric,courier_currency=payload->>'courier_currency',courier_mzn_per_unit=(payload->>'courier_mzn_per_unit')::numeric,
   revision=revision+1,updated_at=now() WHERE id=j.id;
  IF (payload->>'cost_confirmed') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirm actual booked courier charge'; END IF;
  INSERT INTO public.finance_cost_entries(request_id,order_id,kind,amount,currency,mzn_per_unit,basis,reference,incurred_on,created_by)
  VALUES(j.id,o.id,'COURIER',(payload->>'courier_cost')::numeric,payload->>'courier_currency',(payload->>'courier_mzn_per_unit')::numeric,
   'ACTUAL',left('Courier booking '||(payload->>'provider_reference')||' / '||(payload->>'document_reference'),160),(now() AT TIME ZONE 'Africa/Johannesburg')::date,auth.uid()) ON CONFLICT(request_id) DO NOTHING;
  DELETE FROM public.finance_order_reviews WHERE order_id=o.id;
 ELSIF operation='RESOLVE_EXCEPTION' THEN
  IF NOT public.has_capability('shipping.book') OR j.state<>'EXCEPTION' OR j.provider_reference IS NULL THEN RAISE EXCEPTION 'Booked exception and approval permission required'; END IF;
  next_state:=payload->>'resume_state';
  IF next_state NOT IN ('BOOKED','COLLECTED') OR (next_state='BOOKED' AND o.fulfillment_status<>'PACKED') OR (next_state='COLLECTED' AND o.fulfillment_status<>'SHIPPED') THEN RAISE EXCEPTION 'Resume the physically evidenced state only'; END IF;
  IF length(btrim(coalesce(payload->>'evidence_reference',''))) NOT BETWEEN 3 AND 160 OR NOT coalesce((payload->>'max_cost_mzn')::numeric>=round(j.courier_cost*j.courier_mzn_per_unit,2),FALSE) THEN RAISE EXCEPTION 'Verified resolution and explicit cost approval required'; END IF;
  UPDATE public.fulfillment_jobs SET state=next_state,approved_cost_mzn=(payload->>'max_cost_mzn')::numeric,approved_at=now(),approved_by=auth.uid(),last_error=NULL,revision=revision+1,updated_at=now() WHERE id=j.id;
 ELSIF operation IN ('COLLECTED','DELIVERED','EXCEPTION') THEN
  IF length(btrim(coalesce(payload->>'evidence_reference',''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Handover or delivery evidence required'; END IF;
  IF operation='COLLECTED' AND j.state NOT IN ('BOOKED','AWAITING_COLLECTION') THEN RAISE EXCEPTION 'Booked shipment required before handover'; END IF;
  IF operation='DELIVERED' AND j.state NOT IN ('COLLECTED','IN_TRANSIT','OUT_FOR_DELIVERY') THEN RAISE EXCEPTION 'Collected shipment required before delivery'; END IF;
  UPDATE public.fulfillment_jobs SET state=operation,revision=revision+1,updated_at=now() WHERE id=j.id;
  IF operation='COLLECTED' THEN PERFORM public.advance_order_fulfillment(o.id,'MARK_SHIPPED',note); END IF;
  IF operation='DELIVERED' THEN PERFORM public.advance_order_fulfillment(o.id,'MARK_DELIVERED',note); END IF;
 ELSIF operation<>'PREPARE' THEN RAISE EXCEPTION 'Unknown fulfillment operation'; END IF;
 INSERT INTO public.fulfillment_events(job_id,event_key,event_type,public_message,evidence_reference,created_by)
 VALUES(j.id,j.id||':'||operation||':'||j.revision,operation,
  CASE operation WHEN 'IMPORT_BOOKING' THEN 'Courier booking recorded; awaiting collection' WHEN 'COLLECTED' THEN 'Parcel handed to courier' WHEN 'DELIVERED' THEN 'Delivery confirmed' WHEN 'EXCEPTION' THEN 'Our team is resolving a delivery issue' ELSE 'Fulfillment details reviewed' END,
  payload->>'evidence_reference',auth.uid()) ON CONFLICT(event_key) DO NOTHING;
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'FULFILLMENT_'||operation,'order',o.id,jsonb_build_object('job_id',j.id,'revision',j.revision,'note',note));
 RETURN (SELECT jsonb_build_object('id',id,'state',state,'revision',revision) FROM public.fulfillment_jobs WHERE id=j.id);
END; $$;
REVOKE ALL ON FUNCTION public.fulfillment_operate(UUID,TEXT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fulfillment_operate(UUID,TEXT,JSONB) TO authenticated;

-- Existing manual status buttons must not bypass the new evidence requirement.
ALTER FUNCTION public.advance_order_fulfillment(UUID,TEXT,TEXT) RENAME TO advance_order_fulfillment_legacy;
REVOKE ALL ON FUNCTION public.advance_order_fulfillment_legacy(UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.advance_order_fulfillment(target_order_id UUID,fulfillment_action TEXT,operator_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(target_order_id::text,0));
 IF fulfillment_action='MARK_SHIPPED' AND NOT EXISTS(SELECT 1 FROM public.fulfillment_jobs WHERE order_id=target_order_id AND state IN ('COLLECTED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED')) THEN RAISE EXCEPTION 'Record courier handover evidence in fulfillment first'; END IF;
 IF fulfillment_action='MARK_DELIVERED' AND EXISTS(SELECT 1 FROM public.orders WHERE id=target_order_id AND coalesce(shipping_method_snapshot->>'code','') NOT ILIKE '%PICKUP%')
 AND NOT EXISTS(SELECT 1 FROM public.fulfillment_jobs WHERE order_id=target_order_id AND state='DELIVERED') THEN RAISE EXCEPTION 'Record delivery evidence in fulfillment first'; END IF;
 RETURN public.advance_order_fulfillment_legacy(target_order_id,fulfillment_action,operator_note);
END; $$;
REVOKE ALL ON FUNCTION public.advance_order_fulfillment(UUID,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_order_fulfillment(UUID,TEXT,TEXT) TO authenticated;

CREATE FUNCTION public.claim_fulfillment_booking(target_job_id UUID) RETURNS SETOF public.fulfillment_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.fulfillment_jobs%ROWTYPE;o public.orders%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.fulfillment_jobs WHERE id=target_job_id;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(j.order_id::text,0));
 SELECT * INTO o FROM public.orders WHERE id=j.order_id FOR UPDATE;
 SELECT * INTO j FROM public.fulfillment_jobs WHERE id=target_job_id FOR UPDATE;
 IF j.state='BOOKING_PENDING' AND j.lease_until<now() THEN
  UPDATE public.fulfillment_jobs SET state='BOOKING_UNKNOWN',last_error='Lease expired; reconcile by merchant reference before any retry',updated_at=now() WHERE id=j.id;
  RETURN;
 END IF;
 IF j.state<>'READY' OR j.approved_at IS NULL OR j.approved_cost_mzn IS NULL OR NOT j.address_confirmed OR NOT j.origin_confirmed OR NOT j.packed_confirmed
  OR o.payment_status<>'PAID' OR o.fulfillment_status<>'PACKED' OR o.status NOT IN ('PACKED','PROCESSING')
  OR EXISTS(SELECT 1 FROM public.checkout_payment_holds WHERE order_id=o.id AND resolved_at IS NULL)
  OR EXISTS(SELECT 1 FROM public.order_refund_requests WHERE order_id=o.id AND status IN ('REQUESTED','UNDER_REVIEW','RECORDED'))
  OR EXISTS(SELECT 1 FROM public.payments WHERE order_id=o.id AND reconciliation_needs_review) THEN RETURN; END IF;
 RETURN QUERY UPDATE public.fulfillment_jobs SET state='BOOKING_PENDING',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1,updated_at=now() WHERE id=j.id RETURNING *;
END; $$;
REVOKE ALL ON FUNCTION public.claim_fulfillment_booking(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fulfillment_booking(UUID) TO service_role;

CREATE FUNCTION public.finish_fulfillment_booking(target_job_id UUID,target_lease UUID,outcome TEXT,booking JSONB) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.fulfillment_jobs%ROWTYPE;cost_mzn NUMERIC;
BEGIN
 SELECT * INTO j FROM public.fulfillment_jobs WHERE id=target_job_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown job'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(j.order_id::text,0));
 SELECT * INTO j FROM public.fulfillment_jobs WHERE id=target_job_id FOR UPDATE;
 IF j.lease_token IS DISTINCT FROM target_lease OR j.state NOT IN ('BOOKING_PENDING','BOOKING_UNKNOWN') THEN RAISE EXCEPTION 'Stale booking attempt'; END IF;
 IF outcome='UNKNOWN' THEN
  UPDATE public.fulfillment_jobs SET state='BOOKING_UNKNOWN',last_error='Reconcile provider reference; do not repeat the booking',updated_at=now() WHERE id=j.id;
 ELSIF outcome='REJECTED' THEN
  UPDATE public.fulfillment_jobs SET state='EXCEPTION',last_error='Provider explicitly rejected booking; staff review required',updated_at=now() WHERE id=j.id;
 ELSIF outcome='BOOKED' THEN
  IF length(coalesce(booking->>'provider_reference','')) NOT BETWEEN 3 AND 128 OR length(coalesce(booking->>'document_reference','')) NOT BETWEEN 3 AND 160
   OR NOT coalesce((booking->>'cost')::numeric>=0 AND (booking->>'mzn_per_unit')::numeric>0 AND booking->>'currency' IN ('MZN','ZAR','GBP','USD','EUR'),FALSE)
   OR (booking->>'currency'='MZN' AND (booking->>'mzn_per_unit')::numeric<>1) THEN RAISE EXCEPTION 'Invalid provider booking response'; END IF;
  IF coalesce(booking->>'tracking_url','')<>'' AND booking->>'tracking_url' !~ '^https://(portal\.|www\.)?internetexpress\.co\.za(/|$)' THEN RAISE EXCEPTION 'Unapproved tracking host'; END IF;
  cost_mzn:=round((booking->>'cost')::numeric*(booking->>'mzn_per_unit')::numeric,2);
  UPDATE public.fulfillment_jobs SET state=CASE WHEN cost_mzn>j.approved_cost_mzn THEN 'EXCEPTION' ELSE 'BOOKED' END,
   provider_reference=booking->>'provider_reference',document_reference=booking->>'document_reference',tracking_url=nullif(booking->>'tracking_url',''),
   courier_cost=(booking->>'cost')::numeric,courier_currency=booking->>'currency',courier_mzn_per_unit=(booking->>'mzn_per_unit')::numeric,
   last_error=CASE WHEN cost_mzn>j.approved_cost_mzn THEN 'Booked charge exceeds approval; do not rebook or automatically cancel' ELSE NULL END,updated_at=now() WHERE id=j.id;
  INSERT INTO public.finance_cost_entries(request_id,order_id,kind,amount,currency,mzn_per_unit,basis,reference,incurred_on)
  VALUES(j.id,j.order_id,'COURIER',(booking->>'cost')::numeric,booking->>'currency',(booking->>'mzn_per_unit')::numeric,'ACTUAL',left('Courier API booking '||(booking->>'provider_reference'),160),(now() AT TIME ZONE 'Africa/Johannesburg')::date) ON CONFLICT(request_id) DO NOTHING;
  DELETE FROM public.finance_order_reviews WHERE order_id=j.order_id;
 ELSE RAISE EXCEPTION 'Unknown booking outcome'; END IF;
 INSERT INTO public.fulfillment_events(job_id,event_key,event_type,public_message) VALUES(j.id,'booking:'||target_lease,outcome,CASE outcome WHEN 'BOOKED' THEN 'Courier booking recorded; awaiting collection' ELSE 'Our team is checking courier booking' END) ON CONFLICT(event_key) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.finish_fulfillment_booking(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_fulfillment_booking(UUID,UUID,TEXT,JSONB) TO service_role;

CREATE FUNCTION public.claim_order_email() RETURNS SETOF public.order_message_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.order_message_outbox SET state='UNKNOWN',last_error='Expired send claim; verify provider outcome before retrying',updated_at=now() WHERE state='SENDING' AND claimed_at<now()-interval '3 minutes';
 RETURN QUERY UPDATE public.order_message_outbox SET state='SENDING',claimed_at=now(),updated_at=now()
 WHERE id=(SELECT id FROM public.order_message_outbox WHERE state='QUEUED' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
END; $$;
REVOKE ALL ON FUNCTION public.claim_order_email() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_email() TO service_role;
