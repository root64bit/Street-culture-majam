CREATE FUNCTION public.advance_order_fulfillment(
  target_order_id UUID, fulfillment_action TEXT, operator_note TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  next_status public.order_status_enum;
  next_fulfillment public.order_fulfillment_status_enum;
BEGIN
  IF NOT public.has_capability('orders.update') THEN
    RAISE EXCEPTION 'Order update permission required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'An operator note of 10–1000 characters is required';
  END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = target_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF current_order.payment_status <> 'PAID' THEN
    RAISE EXCEPTION 'Unpaid orders cannot be fulfilled';
  END IF;
  IF current_order.status IN ('CANCELLED','REFUNDED') THEN
    RAISE EXCEPTION 'Closed orders cannot be fulfilled';
  END IF;
  next_status := CASE
    WHEN fulfillment_action = 'START_PROCESSING' AND current_order.status = 'CONFIRMED'
      AND current_order.fulfillment_status = 'UNFULFILLED' THEN 'PROCESSING'
    WHEN fulfillment_action = 'MARK_PACKED' AND current_order.status = 'PROCESSING'
      AND current_order.fulfillment_status = 'UNFULFILLED' THEN 'PROCESSING'
    WHEN fulfillment_action = 'MARK_SHIPPED' AND current_order.status = 'PROCESSING'
      AND current_order.fulfillment_status = 'PACKED' THEN 'SHIPPED'
    WHEN fulfillment_action = 'MARK_DELIVERED' AND current_order.status = 'SHIPPED'
      AND current_order.fulfillment_status = 'SHIPPED' THEN 'DELIVERED'
    ELSE NULL END;
  IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid fulfillment transition'; END IF;
  next_fulfillment := CASE fulfillment_action
    WHEN 'MARK_PACKED' THEN 'PACKED'
    WHEN 'MARK_SHIPPED' THEN 'SHIPPED'
    WHEN 'MARK_DELIVERED' THEN 'DELIVERED'
    ELSE 'UNFULFILLED' END;
  UPDATE public.orders SET status = next_status, fulfillment_status = next_fulfillment
  WHERE id = target_order_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),concat('ORDER_',fulfillment_action),'order',target_order_id,
    jsonb_build_object('from_status',current_order.status,'from_fulfillment',current_order.fulfillment_status,
      'to_status',next_status,'to_fulfillment',next_fulfillment,'note',btrim(operator_note)));
  RETURN jsonb_build_object('status',next_status,'fulfillmentStatus',next_fulfillment);
END; $$;
REVOKE ALL ON FUNCTION public.advance_order_fulfillment(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_order_fulfillment(UUID,TEXT,TEXT) TO authenticated;
