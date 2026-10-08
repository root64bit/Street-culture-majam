INSERT INTO public.role_capabilities(role,capability) SELECT DISTINCT role,'notifications.read' FROM public.role_capabilities WHERE capability='dashboard.read' ON CONFLICT DO NOTHING;
CREATE TABLE public.admin_operational_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),event_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,title TEXT NOT NULL,href TEXT NOT NULL CHECK(href LIKE '/admin%'),
  required_capability TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE public.admin_notification_receipts (
  notification_id UUID NOT NULL REFERENCES public.admin_operational_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(notification_id,user_id)
);
ALTER TABLE public.admin_operational_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped admin operational alerts" ON public.admin_operational_notifications FOR SELECT TO authenticated
  USING(public.has_capability('notifications.read') AND public.has_capability(required_capability));
CREATE POLICY "Own admin notification receipts" ON public.admin_notification_receipts FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE INDEX operational_notifications_created_idx ON public.admin_operational_notifications(created_at DESC);

CREATE FUNCTION public.emit_admin_operational_notification() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_type TEXT; event_title TEXT; event_href TEXT; permission TEXT; identity_key TEXT; stock_count BIGINT; threshold INTEGER;
BEGIN
  IF TG_TABLE_NAME='orders' THEN
    IF TG_OP='INSERT' OR (NEW.payment_status='PAID' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
      event_type:=CASE WHEN NEW.payment_status='PAID' THEN 'ORDER_PAID' ELSE 'NEW_ORDER' END;
      event_title:=NEW.order_number||CASE WHEN NEW.payment_status='PAID' THEN ' — payment confirmed' ELSE ' — new checkout' END;
      event_href:='/admin/orders/'||NEW.id;permission:='orders.read';
    END IF;
  ELSIF TG_TABLE_NAME='payments' THEN
    IF NEW.status='FAILED' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      event_type:='PAYMENT_FAILED';event_title:='Payment failed — '||coalesce(NEW.provider_reference,substr(NEW.id::TEXT,1,8));event_href:='/admin/payments';permission:='payments.read';
    ELSIF NEW.reconciliation_needs_review AND (TG_OP='INSERT' OR NOT OLD.reconciliation_needs_review) THEN
      event_type:='PAYMENT_REVIEW';event_title:='Payment mismatch requires review';event_href:='/admin/payments/reconciliation';permission:='payments.read';
    END IF;
  ELSIF TG_TABLE_NAME='consignment_submissions' AND NEW.status='SUBMITTED' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    event_type:='NEW_CONSIGNMENT';event_title:=NEW.brand_name||' '||NEW.product_name||' — awaiting review';event_href:='/admin/consignments/'||NEW.id;permission:='consignments.read';
  ELSIF TG_TABLE_NAME='authentication_records' AND NEW.status='PENDING' AND NEW.consignment_submission_id IS NOT NULL THEN
    event_type:='AUTHENTICATION_WAITING';event_title:='Consignment inspection waiting';event_href:='/admin/authentication/'||NEW.id;permission:='authentication.review';
  ELSIF TG_TABLE_NAME='seller_payouts' AND NEW.status='PENDING' THEN
    event_type:='PAYOUT_PENDING';event_title:='Seller payout pending — '||NEW.net_amount||' '||NEW.currency;event_href:='/admin/payouts';permission:='payouts.read';
  ELSIF TG_TABLE_NAME='product_import_batches' AND (NEW.status IN ('FAILED','PARTIAL') OR NEW.invalid_rows>0) THEN
    event_type:='IMPORT_REVIEW';event_title:='Import rows require attention';event_href:='/admin/imports/'||NEW.id;permission:='products.import';
  ELSIF TG_TABLE_NAME='listings' AND NEW.status='SOLD' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT coalesce((value->>'lowStockThreshold')::INTEGER,1) INTO threshold FROM public.store_settings WHERE key='notifications';
    SELECT count(*) INTO stock_count FROM public.listings WHERE product_id=NEW.product_id AND status='LIVE';
    IF stock_count<=coalesce(threshold,1) THEN
      event_type:='LOW_STOCK';SELECT name||' — '||stock_count||' units available' INTO event_title FROM public.products WHERE id=NEW.product_id;
      event_href:='/admin/inventory';permission:='inventory.read';
    END IF;
  END IF;
  IF event_type IS NOT NULL THEN
    identity_key:=TG_TABLE_NAME||':'||NEW.id::TEXT||':'||event_type;
    INSERT INTO public.admin_operational_notifications(event_key,type,title,href,required_capability)
      VALUES(identity_key,event_type,event_title,event_href,permission) ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER orders_operator_notification AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.emit_admin_operational_notification();
CREATE TRIGGER payments_operator_notification AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.emit_admin_operational_notification();
CREATE TRIGGER consignments_operator_notification AFTER INSERT OR UPDATE ON public.consignment_submissions FOR EACH ROW EXECUTE FUNCTION public.emit_admin_operational_notification();
CREATE TRIGGER authentication_operator_notification AFTER INSERT ON public.authentication_records FOR EACH ROW EXECUTE FUNCTION public.emit_admin_operational_notification();
CREATE TRIGGER payouts_operator_notification AFTER INSERT ON public.seller_payouts FOR EACH ROW EXECUTE FUNCTION public.emit_admin_operational_notification();
CREATE TRIGGER imports_operator_notification AFTER INSERT OR UPDATE ON public.product_import_batches FOR EACH ROW EXECUTE FUNCTION public.emit_admin_operational_notification();
CREATE TRIGGER inventory_operator_notification AFTER UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.emit_admin_operational_notification();

CREATE FUNCTION public.admin_notification_inbox(unread_only BOOLEAN DEFAULT FALSE,page_offset INTEGER DEFAULT 0,page_limit INTEGER DEFAULT 30)
RETURNS TABLE(id UUID,type TEXT,title TEXT,href TEXT,created_at TIMESTAMPTZ,read_at TIMESTAMPTZ,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('notifications.read') THEN RAISE EXCEPTION 'Inbox permission required' USING ERRCODE='42501'; END IF;
  IF page_offset<0 OR page_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid inbox query'; END IF;
  RETURN QUERY SELECT notification.id,notification.type,notification.title,notification.href,notification.created_at,receipt.read_at,count(*) OVER()
    FROM public.admin_operational_notifications notification LEFT JOIN public.admin_notification_receipts receipt
      ON receipt.notification_id=notification.id AND receipt.user_id=auth.uid()
    WHERE public.has_capability(notification.required_capability) AND(NOT unread_only OR receipt.read_at IS NULL)
    ORDER BY notification.created_at DESC,notification.id OFFSET page_offset LIMIT page_limit;
END; $$;
REVOKE ALL ON FUNCTION public.admin_notification_inbox(BOOLEAN,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_notification_inbox(BOOLEAN,INTEGER,INTEGER) TO authenticated;
CREATE FUNCTION public.mark_admin_notifications_read(notification_ids UUID[]) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed INTEGER;
BEGIN
  IF NOT public.has_capability('notifications.read') THEN RAISE EXCEPTION 'Inbox permission required' USING ERRCODE='42501'; END IF;
  IF cardinality(notification_ids) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Choose up to 50 notifications'; END IF;
  INSERT INTO public.admin_notification_receipts(notification_id,user_id)
    SELECT notification.id,auth.uid() FROM public.admin_operational_notifications notification
    WHERE notification.id=ANY(notification_ids) AND public.has_capability(notification.required_capability) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS changed=ROW_COUNT;RETURN changed;
END; $$;
REVOKE ALL ON FUNCTION public.mark_admin_notifications_read(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_admin_notifications_read(UUID[]) TO authenticated;
