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
    WHEN payout_action = 'APPROVE' AND current_payout.status IN ('PENDING','FAILED') THEN 'APPROVED'
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

CREATE OR REPLACE FUNCTION public.operational_store_context()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'store', coalesce((SELECT value FROM public.store_settings WHERE key = 'store'), '{}'::jsonb),
    'consignment', coalesce((SELECT value FROM public.store_settings WHERE key = 'consignment'), '{}'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.operational_store_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_store_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'Africa/Maputo') AT TIME ZONE 'Africa/Maputo';
  month_start TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'Africa/Maputo') AT TIME ZONE 'Africa/Maputo';
  low_stock_threshold INTEGER := greatest(1, coalesce((SELECT (value->>'lowStockThreshold')::INTEGER FROM public.store_settings WHERE key = 'notifications'), 1));
  can_orders BOOLEAN;
  can_payments BOOLEAN;
  can_catalog BOOLEAN;
  can_consignments BOOLEAN;
  can_payouts BOOLEAN;
  can_imports BOOLEAN;
BEGIN
  IF NOT public.has_capability('dashboard.read') THEN
    RAISE EXCEPTION 'Dashboard permission required' USING ERRCODE = '42501';
  END IF;
  can_orders := public.has_capability('orders.read');
  can_payments := public.has_capability('payments.read');
  can_catalog := public.has_capability('inventory.read');
  can_consignments := public.has_capability('consignments.read');
  can_payouts := public.has_capability('payouts.read');
  can_imports := public.has_capability('products.import');
  RETURN jsonb_build_object(
    'revenueToday', CASE WHEN can_payments THEN
      (SELECT coalesce(sum(amount),0) FROM public.payments WHERE status='SUCCEEDED' AND paid_at>=today_start) END,
    'revenueMonth', CASE WHEN can_payments THEN
      (SELECT coalesce(sum(amount),0) FROM public.payments WHERE status='SUCCEEDED' AND paid_at>=month_start) END,
    'ordersToday', CASE WHEN can_orders THEN
      (SELECT count(*) FROM public.orders WHERE created_at>=today_start) END,
    'pendingOrders', CASE WHEN can_orders THEN
      (SELECT count(*) FROM public.orders WHERE status='PENDING') END,
    'paidRequiresReview', CASE WHEN can_orders THEN
      (SELECT count(*) FROM public.orders WHERE payment_status='PAID' AND status='CANCELLED') END,
    'failedPayments', CASE WHEN can_payments THEN
      (SELECT count(*) FROM public.payments WHERE status='FAILED') END,
    'stalePayments', CASE WHEN can_payments THEN
      (SELECT count(*) FROM public.payments WHERE status IN ('PENDING','REQUIRES_ACTION') AND created_at<now()-interval '15 minutes') END,
    'liveListings', CASE WHEN can_catalog THEN
      (SELECT count(*) FROM public.listings WHERE status='LIVE') END,
    'reservedListings', CASE WHEN can_catalog THEN
      (SELECT count(*) FROM public.listings WHERE status='RESERVED') END,
    'soldListings', CASE WHEN can_catalog THEN
      (SELECT count(*) FROM public.listings WHERE status='SOLD') END,
    'draftListings', CASE WHEN can_catalog THEN
      (SELECT count(*) FROM public.listings WHERE status='DRAFT') END,
    'oneUnitLeft', CASE WHEN can_catalog THEN
      (SELECT count(*) FROM public.listings WHERE status='LIVE' AND quantity<=low_stock_threshold) END,
    'pendingConsignments', CASE WHEN can_consignments THEN
      (SELECT count(*) FROM public.consignment_submissions WHERE status IN ('SUBMITTED','UNDER_REVIEW')) END,
    'authenticationQueue', CASE WHEN public.has_capability('authentication.review') THEN
      (SELECT count(*) FROM public.consignment_submissions WHERE status IN ('AUTHENTICATION_PENDING','AUTHENTICATION_IN_PROGRESS')) END,
    'pendingPayouts', CASE WHEN can_payouts THEN
      (SELECT count(*) FROM public.seller_payouts WHERE status IN ('PENDING','APPROVED','PROCESSING')) END,
    'importFailures', CASE WHEN can_imports THEN
      (SELECT count(*) FROM public.product_import_batches WHERE status IN ('FAILED','PARTIAL')) END
  );
END; $$;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics() TO authenticated;
