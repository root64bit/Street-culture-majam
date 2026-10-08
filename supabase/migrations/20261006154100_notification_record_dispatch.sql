-- Dispatch before inspecting table-specific record fields/enums. PostgreSQL
-- prepares every referenced field in an expression even across AND branches.
CREATE OR REPLACE FUNCTION public.emit_admin_operational_notification() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_type TEXT; event_title TEXT; event_href TEXT; permission TEXT; identity_key TEXT; stock_count BIGINT; threshold INTEGER;
BEGIN
  CASE TG_TABLE_NAME
  WHEN 'orders' THEN
    IF TG_OP='INSERT' OR (NEW.payment_status='PAID' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
      event_type:=CASE WHEN NEW.payment_status='PAID' THEN 'ORDER_PAID' ELSE 'NEW_ORDER' END;
      event_title:=NEW.order_number||CASE WHEN NEW.payment_status='PAID' THEN ' — payment confirmed' ELSE ' — new checkout' END;
      event_href:='/admin/orders/'||NEW.id;permission:='orders.read';
    END IF;
  WHEN 'payments' THEN
    IF NEW.status='FAILED' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      event_type:='PAYMENT_FAILED';event_title:='Payment failed — '||coalesce(NEW.provider_reference,substr(NEW.id::TEXT,1,8));event_href:='/admin/payments';permission:='payments.read';
    ELSIF NEW.reconciliation_needs_review AND (TG_OP='INSERT' OR NOT OLD.reconciliation_needs_review) THEN
      event_type:='PAYMENT_REVIEW';event_title:='Payment mismatch requires review';event_href:='/admin/payments/reconciliation';permission:='payments.read';
    END IF;
  WHEN 'consignment_submissions' THEN
    IF NEW.status='SUBMITTED' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      event_type:='NEW_CONSIGNMENT';event_title:=NEW.brand_name||' '||NEW.product_name||' — awaiting review';event_href:='/admin/consignments/'||NEW.id;permission:='consignments.read';
    END IF;
  WHEN 'authentication_records' THEN
    IF NEW.status='PENDING' AND NEW.consignment_submission_id IS NOT NULL THEN
      event_type:='AUTHENTICATION_WAITING';event_title:='Consignment inspection waiting';event_href:='/admin/authentication/'||NEW.id;permission:='authentication.review';
    END IF;
  WHEN 'seller_payouts' THEN
    IF NEW.status='PENDING' THEN event_type:='PAYOUT_PENDING';event_title:='Seller payout pending — '||NEW.net_amount||' '||NEW.currency;event_href:='/admin/payouts';permission:='payouts.read';END IF;
  WHEN 'product_import_batches' THEN
    IF NEW.status IN ('FAILED','PARTIAL') OR NEW.invalid_rows>0 THEN
      event_type:='IMPORT_REVIEW';event_title:='Import rows require attention';event_href:='/admin/imports/'||NEW.id;permission:='products.import';
    END IF;
  WHEN 'listings' THEN
    IF NEW.status='SOLD' AND OLD.status IS DISTINCT FROM NEW.status THEN
      SELECT coalesce((value->>'lowStockThreshold')::INTEGER,1) INTO threshold FROM public.store_settings WHERE key='notifications';
      SELECT count(*) INTO stock_count FROM public.listings WHERE product_id=NEW.product_id AND status='LIVE';
      IF stock_count<=coalesce(threshold,1) THEN
        event_type:='LOW_STOCK';SELECT name||' — '||stock_count||' units available' INTO event_title FROM public.products WHERE id=NEW.product_id;
        event_href:='/admin/inventory';permission:='inventory.read';
      END IF;
    END IF;
  ELSE NULL;
  END CASE;
  IF event_type IS NOT NULL THEN
    identity_key:=TG_TABLE_NAME||':'||NEW.id::TEXT||':'||event_type;
    INSERT INTO public.admin_operational_notifications(event_key,type,title,href,required_capability)
      VALUES(identity_key,event_type,event_title,event_href,permission) ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
