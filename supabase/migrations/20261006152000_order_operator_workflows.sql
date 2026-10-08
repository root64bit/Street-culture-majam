CREATE TABLE public.order_operator_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (length(btrim(note)) BETWEEN 10 AND 2000),created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.order_operator_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order operator notes read" ON public.order_operator_notes FOR SELECT TO authenticated USING(public.has_capability('orders.read'));
CREATE INDEX order_notes_order_created_idx ON public.order_operator_notes(order_id,created_at DESC);
CREATE TABLE public.order_refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1000),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','UNDER_REVIEW','REJECTED','RECORDED')),
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note TEXT,external_reference TEXT UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.order_refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order operator refund request read" ON public.order_refund_requests FOR SELECT TO authenticated USING(public.has_capability('orders.read') OR public.has_capability('payments.read'));
INSERT INTO public.role_capabilities(role,capability) VALUES('SUPER_ADMIN','payments.refund'),('FINANCE','payments.refund');

CREATE OR REPLACE FUNCTION public.advance_order_fulfillment(target_order_id UUID,fulfillment_action TEXT,operator_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_order public.orders%ROWTYPE; next_status public.order_status_enum; next_fulfillment public.order_fulfillment_status_enum;
BEGIN
  IF NOT public.has_capability('orders.update') THEN RAISE EXCEPTION 'Order update permission required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Operator note required'; END IF;
  SELECT * INTO current_order FROM public.orders WHERE id=target_order_id FOR UPDATE;
  IF NOT FOUND OR current_order.payment_status<>'PAID' OR current_order.status IN ('CANCELLED','REFUNDED') THEN RAISE EXCEPTION 'Only paid open orders can be fulfilled'; END IF;
  next_status:=(CASE
    WHEN fulfillment_action='START_PROCESSING' AND current_order.status='CONFIRMED' AND current_order.fulfillment_status='UNFULFILLED' THEN 'PROCESSING'
    WHEN fulfillment_action='MARK_PACKED' AND current_order.status='PROCESSING' AND current_order.fulfillment_status='UNFULFILLED' THEN 'PACKED'
    WHEN fulfillment_action='MARK_SHIPPED' AND current_order.status IN ('PROCESSING','PACKED') AND current_order.fulfillment_status='PACKED' THEN 'SHIPPED'
    WHEN fulfillment_action='MARK_READY_FOR_PICKUP' AND current_order.fulfillment_status='PACKED'
      AND coalesce(current_order.shipping_method_snapshot->>'code','') ILIKE '%PICKUP%' THEN 'READY_FOR_PICKUP'
    WHEN fulfillment_action='MARK_DELIVERED' AND current_order.status IN ('SHIPPED','READY_FOR_PICKUP') AND current_order.fulfillment_status IN ('SHIPPED','READY_FOR_PICKUP') THEN 'DELIVERED'
    ELSE NULL END)::public.order_status_enum;
  IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid fulfillment transition'; END IF;
  next_fulfillment:=(CASE fulfillment_action WHEN 'MARK_PACKED' THEN 'PACKED' WHEN 'MARK_SHIPPED' THEN 'SHIPPED'
    WHEN 'MARK_READY_FOR_PICKUP' THEN 'READY_FOR_PICKUP' WHEN 'MARK_DELIVERED' THEN 'DELIVERED' ELSE 'UNFULFILLED' END)::public.order_fulfillment_status_enum;
  UPDATE public.orders SET status=next_status,fulfillment_status=next_fulfillment WHERE id=target_order_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'ORDER_'||fulfillment_action,'order',target_order_id,jsonb_build_object('from_status',current_order.status,'from_fulfillment',current_order.fulfillment_status,
    'to_status',next_status,'to_fulfillment',next_fulfillment,'note',btrim(operator_note)));
  RETURN jsonb_build_object('status',next_status,'fulfillmentStatus',next_fulfillment);
END; $$;

CREATE FUNCTION public.operate_order(target_order_id UUID,order_action TEXT,operator_note TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.has_capability('orders.update') THEN RAISE EXCEPTION 'Order update permission required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Operator note required'; END IF;
  IF order_action='CANCEL' THEN
    PERFORM 1 FROM public.payments WHERE order_id=target_order_id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.listings WHERE reserved_by_order_id=target_order_id ORDER BY id FOR UPDATE;
  END IF;
  SELECT * INTO current_order FROM public.orders WHERE id=target_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_action='ADD_NOTE' THEN
    INSERT INTO public.order_operator_notes(order_id,note,created_by) VALUES(target_order_id,btrim(operator_note),auth.uid());
  ELSIF order_action='REQUEST_REFUND' AND current_order.payment_status='PAID' AND current_order.status<>'REFUNDED' THEN
    INSERT INTO public.order_refund_requests(order_id,reason,requested_by) VALUES(target_order_id,btrim(operator_note),auth.uid());
  ELSIF order_action='CANCEL' AND current_order.status='PENDING' AND current_order.payment_status<>'PAID'
    AND NOT EXISTS(SELECT 1 FROM public.payments WHERE order_id=target_order_id AND status='SUCCEEDED') THEN
    UPDATE public.orders SET status='CANCELLED' WHERE id=target_order_id;
    UPDATE public.consignment_submissions SET status='LISTED' WHERE id IN(SELECT consignment_submission_id FROM public.listings WHERE reserved_by_order_id=target_order_id AND status='RESERVED');
    UPDATE public.listings SET status='LIVE',reserved_at=NULL,reservation_expires_at=NULL,reserved_by_order_id=NULL WHERE reserved_by_order_id=target_order_id AND status='RESERVED';
    INSERT INTO public.order_events(order_id,event_type,created_by) VALUES(target_order_id,'ORDER_CANCELLED',auth.uid());
  ELSE RAISE EXCEPTION 'Invalid order action'; END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'ORDER_'||order_action,'order',target_order_id,jsonb_build_object('reason',btrim(operator_note)));
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.operate_order(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operate_order(UUID,TEXT,TEXT) TO authenticated;

CREATE FUNCTION public.review_order_refund(target_order_id UUID,refund_action TEXT,operator_note TEXT,transfer_reference TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request_record public.order_refund_requests%ROWTYPE; current_order public.orders%ROWTYPE; next_state TEXT;
BEGIN
  IF NOT public.has_capability('payments.refund') THEN RAISE EXCEPTION 'Finance refund permission required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Review note required'; END IF;
  SELECT * INTO request_record FROM public.order_refund_requests WHERE order_id=target_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund request not found'; END IF;
  IF refund_action='START_REVIEW' AND request_record.status='REQUESTED' THEN next_state:='UNDER_REVIEW';
  ELSIF refund_action='REJECT' AND request_record.status='UNDER_REVIEW' THEN next_state:='REJECTED';
  ELSIF refund_action='RECORD_REFUND' AND request_record.status='UNDER_REVIEW' THEN
    IF length(btrim(coalesce(transfer_reference,''))) NOT BETWEEN 6 AND 100 THEN RAISE EXCEPTION 'Verified external refund reference required'; END IF;
    PERFORM 1 FROM public.seller_payouts payout JOIN public.order_items item ON item.id=payout.order_item_id WHERE item.order_id=target_order_id FOR UPDATE OF payout;
    IF EXISTS(SELECT 1 FROM public.seller_payouts payout JOIN public.order_items item ON item.id=payout.order_item_id WHERE item.order_id=target_order_id AND payout.status IN ('PAID','PROCESSING')) THEN
      RAISE EXCEPTION 'Settle in-flight or paid seller payouts before recording a refund'; END IF;
    SELECT * INTO current_order FROM public.orders WHERE id=target_order_id FOR UPDATE;
    IF current_order.payment_status<>'PAID' THEN RAISE EXCEPTION 'Only paid orders can be refunded'; END IF;
    UPDATE public.orders SET status='REFUNDED',payment_status='REFUNDED' WHERE id=target_order_id;
    UPDATE public.seller_payouts SET status='CANCELLED' WHERE order_item_id IN(SELECT id FROM public.order_items WHERE order_id=target_order_id) AND status IN ('PENDING','APPROVED','FAILED');
    -- Inventory stays sold until an actual physical return is inspected. A
    -- recorded transfer is not a new sellable unit or a gateway API refund.
    INSERT INTO public.order_events(order_id,event_type,created_by) VALUES(target_order_id,'REFUND_RECORDED',auth.uid());
    next_state:='RECORDED';
  ELSE RAISE EXCEPTION 'Invalid refund transition'; END IF;
  UPDATE public.order_refund_requests SET status=next_state,reviewed_by=auth.uid(),review_note=btrim(operator_note),updated_at=NOW(),
    external_reference=CASE WHEN next_state='RECORDED' THEN btrim(transfer_reference) ELSE external_reference END WHERE id=request_record.id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'REFUND_'||refund_action,'order',target_order_id,jsonb_build_object('reason',btrim(operator_note),'reference',CASE WHEN next_state='RECORDED' THEN btrim(transfer_reference) END));
  RETURN next_state;
END; $$;
REVOKE ALL ON FUNCTION public.review_order_refund(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_order_refund(UUID,TEXT,TEXT,TEXT) TO authenticated;
