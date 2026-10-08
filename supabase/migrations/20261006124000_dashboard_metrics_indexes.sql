-- Indexes for the actual admin filter and queue paths. Existing unique indexes
-- already cover product slug, payment provider reference, and import reference.
CREATE INDEX IF NOT EXISTS products_brand_id_idx ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products(category_id);
CREATE INDEX IF NOT EXISTS products_updated_at_idx ON public.products(updated_at DESC);
CREATE INDEX IF NOT EXISTS listings_status_created_idx ON public.listings(status,created_at DESC);
CREATE INDEX IF NOT EXISTS listings_product_id_idx ON public.listings(product_id);
CREATE INDEX IF NOT EXISTS orders_user_created_idx ON public.orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON public.orders(status,created_at DESC);
CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON public.payments(status,created_at DESC);
CREATE INDEX IF NOT EXISTS consignment_seller_created_idx ON public.consignment_submissions(seller_id,created_at DESC);
CREATE INDEX IF NOT EXISTS consignment_status_created_idx ON public.consignment_submissions(status,created_at DESC);
CREATE INDEX IF NOT EXISTS seller_payouts_status_created_idx ON public.seller_payouts(status,created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS authentication_records_status_created_idx ON public.authentication_records(status,created_at DESC);

CREATE FUNCTION public.admin_dashboard_metrics()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'Africa/Maputo') AT TIME ZONE 'Africa/Maputo';
  month_start TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'Africa/Maputo') AT TIME ZONE 'Africa/Maputo';
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
      (SELECT count(*) FROM public.listings WHERE status='LIVE' AND quantity=1) END,
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
