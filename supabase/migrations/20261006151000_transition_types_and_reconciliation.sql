ALTER TABLE public.payments ADD COLUMN last_reconciled_at TIMESTAMPTZ, ADD COLUMN last_provider_status TEXT, ADD COLUMN reconciliation_needs_review BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX payments_reconciliation_queue_idx ON public.payments(status,last_reconciled_at,created_at) WHERE provider='mpesa';

CREATE OR REPLACE FUNCTION public.transition_consignment(
  target_submission_id UUID, review_action TEXT, review_notes TEXT
)
RETURNS public.consignment_status_enum LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  submission public.consignment_submissions%ROWTYPE;
  next_status public.consignment_status_enum;
BEGIN
  IF NOT public.has_capability('consignments.review') THEN
    RAISE EXCEPTION 'Consignment review permission required' USING ERRCODE = '42501';
  END IF;
  IF review_action NOT IN ('START_REVIEW','REQUEST_INFO','APPROVE','REJECT','AWAIT_ITEM','MARK_RECEIVED','SEND_TO_AUTH')
    OR length(btrim(coalesce(review_notes,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A valid action and a 10–1000 character reason are required';
  END IF;
  SELECT * INTO submission FROM public.consignment_submissions
  WHERE id = target_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consignment not found'; END IF;
  next_status := (CASE
    WHEN review_action = 'START_REVIEW' AND submission.status = 'SUBMITTED' THEN 'UNDER_REVIEW'
    WHEN review_action = 'REQUEST_INFO' AND submission.status = 'UNDER_REVIEW' THEN 'MORE_INFORMATION_REQUIRED'
    WHEN review_action = 'APPROVE' AND submission.status = 'UNDER_REVIEW' THEN 'APPROVED_FOR_DELIVERY'
    WHEN review_action = 'REJECT' AND submission.status = 'UNDER_REVIEW' THEN 'REJECTED'
    WHEN review_action = 'AWAIT_ITEM' AND submission.status = 'APPROVED_FOR_DELIVERY' THEN 'AWAITING_ITEM'
    WHEN review_action = 'MARK_RECEIVED' AND submission.status IN ('APPROVED_FOR_DELIVERY','AWAITING_ITEM','IN_TRANSIT') THEN 'RECEIVED'
    WHEN review_action = 'SEND_TO_AUTH' AND submission.status = 'RECEIVED' THEN 'AUTHENTICATION_PENDING'
    ELSE NULL END)::public.consignment_status_enum;
  IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid consignment status transition'; END IF;
  UPDATE public.consignment_submissions SET status = next_status,
    internal_notes = concat_ws(E'\n',nullif(internal_notes,''),btrim(review_notes)),
    approved_at = CASE WHEN review_action = 'APPROVE' THEN now() ELSE approved_at END,
    received_at = CASE WHEN review_action = 'MARK_RECEIVED' THEN now() ELSE received_at END
  WHERE id = target_submission_id;
  IF review_action = 'SEND_TO_AUTH' THEN
    INSERT INTO public.authentication_records(consignment_submission_id,status)
    VALUES(target_submission_id,'PENDING');
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),concat('CONSIGNMENT_',review_action),'consignment',target_submission_id,
    jsonb_build_object('from',submission.status,'to',next_status,'reason',btrim(review_notes)));
  RETURN next_status;
END; $$;
REVOKE ALL ON FUNCTION public.transition_consignment(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_consignment(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_seller_payout(
  target_payout_id UUID, payout_action TEXT, operator_note TEXT,
  payout_method TEXT DEFAULT NULL, payout_reference TEXT DEFAULT NULL
)
RETURNS public.payout_status_enum LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_payout public.seller_payouts%ROWTYPE;
  next_status public.payout_status_enum;
BEGIN
  IF payout_action = 'MARK_PAID' THEN
    IF NOT public.has_capability('payouts.mark_paid') THEN
      RAISE EXCEPTION 'Finance payment permission required' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(coalesce(payout_method,''))) NOT BETWEEN 2 AND 50
      OR length(btrim(coalesce(payout_reference,''))) NOT BETWEEN 6 AND 100 THEN
      RAISE EXCEPTION 'Payment method and external transaction reference required';
    END IF;
  ELSIF NOT public.has_capability('payouts.approve') THEN
    RAISE EXCEPTION 'Payout approval permission required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'An operator note of 10–1000 characters is required';
  END IF;
  SELECT * INTO current_payout FROM public.seller_payouts WHERE id = target_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;
  next_status := (CASE
    WHEN payout_action = 'APPROVE' AND current_payout.status = 'PENDING' THEN 'APPROVED'
    WHEN payout_action = 'MARK_PROCESSING' AND current_payout.status = 'APPROVED' THEN 'PROCESSING'
    WHEN payout_action = 'MARK_PAID' AND current_payout.status = 'PROCESSING' THEN 'PAID'
    WHEN payout_action = 'MARK_FAILED' AND current_payout.status IN ('APPROVED','PROCESSING') THEN 'FAILED'
    ELSE NULL END)::public.payout_status_enum;
  IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid payout transition'; END IF;
  UPDATE public.seller_payouts SET status = next_status,
    processed_at = CASE WHEN next_status = 'PAID' THEN now() ELSE processed_at END,
    payment_method = CASE WHEN next_status = 'PAID' THEN btrim(payout_method) ELSE payment_method END,
    payment_reference = CASE WHEN next_status = 'PAID' THEN btrim(payout_reference) ELSE payment_reference END
  WHERE id = target_payout_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),concat('PAYOUT_',payout_action),'payout',target_payout_id,
    jsonb_build_object('from',current_payout.status,'to',next_status,
      'note',btrim(operator_note),'payment_method',CASE WHEN next_status = 'PAID' THEN btrim(payout_method) END,
      'payment_reference',CASE WHEN next_status = 'PAID' THEN btrim(payout_reference) END));
  RETURN next_status;
END; $$;
REVOKE ALL ON FUNCTION public.transition_seller_payout(UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_seller_payout(UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_provider_reconciliation(
  target_payment_id UUID, operator_id UUID, provider_status TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  payment_record public.payments%ROWTYPE;
  changed BOOLEAN := FALSE;
  needs_review BOOLEAN := FALSE;
  can_fulfill BOOLEAN;
  failure_recorded BOOLEAN;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF provider_status NOT IN ('PAID','FAILED','CANCELLED','PROCESSING','PENDING') THEN
    RAISE EXCEPTION 'Invalid provider status';
  END IF;
  IF operator_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    JOIN public.user_roles membership ON membership.user_id = profile.id
    JOIN public.role_capabilities permission ON permission.role = membership.role
    WHERE profile.id = operator_id AND profile.account_status = 'ACTIVE' AND NOT profile.admin_access_disabled
      AND permission.capability = 'payments.reconcile'
  ) THEN
    RAISE EXCEPTION 'Reconciliation permission required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO payment_record FROM public.payments
  WHERE id = target_payment_id AND provider = 'mpesa' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'M-Pesa payment not found'; END IF;

  IF provider_status = 'PAID' THEN
    can_fulfill := public.complete_guest_checkout_payment(target_payment_id);
    changed := payment_record.status <> 'SUCCEEDED';
    needs_review := NOT can_fulfill;
  ELSIF provider_status IN ('FAILED','CANCELLED') THEN
    failure_recorded := public.fail_guest_checkout_payment(target_payment_id);
    changed := failure_recorded AND payment_record.status <> 'FAILED';
    needs_review := payment_record.status = 'SUCCEEDED';
  ELSIF payment_record.status IN ('SUCCEEDED','FAILED') THEN
    needs_review := TRUE;
  END IF;

  UPDATE public.payments SET last_reconciled_at=NOW(),last_provider_status=provider_status,reconciliation_needs_review=needs_review WHERE id=target_payment_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(operator_id,'PAYMENT_RECONCILED','payment',target_payment_id,
    jsonb_build_object('provider_status',provider_status,'local_status_before',payment_record.status,
      'changed',changed,'needs_review',needs_review,'order_id',payment_record.order_id,'source',CASE WHEN operator_id IS NULL THEN 'scheduled' ELSE 'operator' END));
  RETURN jsonb_build_object('status',provider_status,'changed',changed,
    'needsReview',needs_review);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_account_directory(directory_kind TEXT,search_text TEXT DEFAULT '',status_filter TEXT DEFAULT '',page_offset INTEGER DEFAULT 0,page_limit INTEGER DEFAULT 30)
RETURNS TABLE(id UUID,email TEXT,full_name TEXT,phone TEXT,account_status TEXT,verification_status TEXT,
  orders_count BIGINT,lifetime_spend NUMERIC,wishlist_count BIGINT,last_order_at TIMESTAMPTZ,
  active_listings BIGINT,sold_listings BIGINT,gross_sales NUMERIC,pending_payouts NUMERIC,total_paid NUMERIC,
  consignments_count BIGINT,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF directory_kind NOT IN ('customer','seller') OR NOT public.has_capability(CASE directory_kind WHEN 'customer' THEN 'customers.read' ELSE 'sellers.read' END) THEN
    RAISE EXCEPTION 'Directory permission required' USING ERRCODE='42501'; END IF;
  IF page_offset<0 OR page_limit NOT BETWEEN 1 AND 100 OR length(search_text)>120
    OR status_filter NOT IN ('','ACTIVE','SUSPENDED','BANNED','PENDING') THEN RAISE EXCEPTION 'Invalid directory query'; END IF;
  RETURN QUERY WITH matched AS (
    SELECT profile.*,account.email::TEXT,coalesce(seller.verification_status,'NOT_REGISTERED') AS verification_status,count(*) OVER() AS result_count
    FROM public.profiles profile JOIN auth.users account ON account.id=profile.id
    LEFT JOIN public.seller_profiles seller ON seller.user_id=profile.id
    WHERE (directory_kind='customer' OR seller.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.consignment_submissions sub WHERE sub.seller_id=profile.id))
      AND (status_filter='' OR profile.account_status=status_filter)
      AND (btrim(search_text)='' OR account.email ILIKE '%'||btrim(search_text)||'%' OR profile.full_name ILIKE '%'||btrim(search_text)||'%'
        OR profile.phone ILIKE '%'||btrim(search_text)||'%' OR profile.id::TEXT=btrim(search_text))
    ORDER BY profile.created_at DESC,profile.id OFFSET page_offset LIMIT page_limit
  ) SELECT matched.id,matched.email,coalesce(matched.full_name,matched.display_name,'Unnamed account'),matched.phone,matched.account_status,matched.verification_status,
    CASE WHEN directory_kind='customer' THEN (SELECT count(*) FROM public.orders o WHERE o.user_id=matched.id) ELSE 0 END,
    CASE WHEN directory_kind='customer' THEN coalesce((SELECT sum(o.total_amount) FROM public.orders o WHERE o.user_id=matched.id AND o.payment_status='PAID' AND o.currency='MZN'),0) ELSE 0 END,
    CASE WHEN directory_kind='customer' THEN (SELECT count(*) FROM public.wishlist_items w WHERE w.user_id=matched.id) ELSE 0 END,
    CASE WHEN directory_kind='customer' THEN (SELECT max(o.created_at) FROM public.orders o WHERE o.user_id=matched.id) ELSE NULL END,
    CASE WHEN directory_kind='seller' THEN (SELECT count(*) FROM public.listings l WHERE l.seller_id=matched.id AND l.status IN ('LIVE','RESERVED')) ELSE 0 END,
    CASE WHEN directory_kind='seller' THEN (SELECT count(*) FROM public.listings l WHERE l.seller_id=matched.id AND l.status='SOLD') ELSE 0 END,
    CASE WHEN directory_kind='seller' THEN coalesce((SELECT sum(p.gross_amount) FROM public.seller_payouts p WHERE p.seller_id=matched.id AND p.currency='MZN'),0) ELSE 0 END,
    CASE WHEN directory_kind='seller' THEN coalesce((SELECT sum(p.net_amount) FROM public.seller_payouts p WHERE p.seller_id=matched.id AND p.currency='MZN' AND p.status IN ('PENDING','APPROVED','PROCESSING','FAILED')),0) ELSE 0 END,
    CASE WHEN directory_kind='seller' THEN coalesce((SELECT sum(p.net_amount) FROM public.seller_payouts p WHERE p.seller_id=matched.id AND p.currency='MZN' AND p.status='PAID'),0) ELSE 0 END,
    CASE WHEN directory_kind='seller' THEN (SELECT count(*) FROM public.consignment_submissions s WHERE s.seller_id=matched.id) ELSE 0 END,matched.result_count FROM matched;
END; $$;
REVOKE ALL ON FUNCTION public.admin_account_directory(TEXT,TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_account_directory(TEXT,TEXT,TEXT,INTEGER,INTEGER) TO authenticated;
