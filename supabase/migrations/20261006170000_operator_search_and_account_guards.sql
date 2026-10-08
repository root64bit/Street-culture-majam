CREATE FUNCTION public.admin_order_workspace(search_text TEXT DEFAULT '',order_filter TEXT DEFAULT '',payment_filter TEXT DEFAULT '',fulfillment_filter TEXT DEFAULT '',from_date DATE DEFAULT NULL,to_date DATE DEFAULT NULL,customer_filter UUID DEFAULT NULL,provider_filter TEXT DEFAULT '',page_offset INTEGER DEFAULT 0,page_limit INTEGER DEFAULT 20)
RETURNS TABLE(id UUID,order_number TEXT,guest_email TEXT,guest_name TEXT,user_id UUID,status public.order_status_enum,payment_status public.order_payment_status_enum,fulfillment_status public.order_fulfillment_status_enum,total_amount NUMERIC,currency TEXT,created_at TIMESTAMPTZ,items_count BIGINT,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('orders.read') THEN RAISE EXCEPTION 'Order read permission required' USING ERRCODE='42501'; END IF;
  IF page_offset<0 OR page_limit NOT BETWEEN 1 AND 100 OR length(search_text)>120 OR provider_filter NOT IN ('','mpesa') OR (from_date IS NOT NULL AND to_date IS NOT NULL AND to_date<from_date) THEN RAISE EXCEPTION 'Invalid order query'; END IF;
  RETURN QUERY SELECT o.id,o.order_number,o.guest_email,o.guest_name,o.user_id,o.status,o.payment_status,o.fulfillment_status,o.total_amount,o.currency,o.created_at,
    (SELECT sum(item.quantity)::BIGINT FROM public.order_items item WHERE item.order_id=o.id),count(*) OVER()
    FROM public.orders o WHERE (order_filter='' OR o.status::TEXT=order_filter) AND(payment_filter='' OR o.payment_status::TEXT=payment_filter) AND(fulfillment_filter='' OR o.fulfillment_status::TEXT=fulfillment_filter)
      AND(from_date IS NULL OR o.created_at>=(from_date::TIMESTAMP AT TIME ZONE 'Africa/Maputo')) AND(to_date IS NULL OR o.created_at<((to_date+1)::TIMESTAMP AT TIME ZONE 'Africa/Maputo'))
      AND(customer_filter IS NULL OR o.user_id=customer_filter) AND(provider_filter='' OR EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=o.id AND p.provider=provider_filter))
      AND(search_text='' OR o.order_number ILIKE '%'||search_text||'%' OR o.guest_email ILIKE '%'||search_text||'%' OR o.guest_phone ILIKE '%'||search_text||'%'
        OR EXISTS(SELECT 1 FROM auth.users u WHERE u.id=o.user_id AND u.email ILIKE '%'||search_text||'%')
        OR EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=o.id AND p.provider_reference ILIKE '%'||search_text||'%'))
    ORDER BY o.created_at DESC,o.id OFFSET page_offset LIMIT page_limit;
END; $$;
REVOKE ALL ON FUNCTION public.admin_order_workspace(TEXT,TEXT,TEXT,TEXT,DATE,DATE,UUID,TEXT,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_order_workspace(TEXT,TEXT,TEXT,TEXT,DATE,DATE,UUID,TEXT,INTEGER,INTEGER) TO authenticated;

CREATE FUNCTION public.guard_suspended_account_new_commerce() RETURNS TRIGGER LANGUAGE plpgsql SET search_path='' AS $$
DECLARE customer_id UUID;
BEGIN
  CASE TG_TABLE_NAME WHEN 'orders' THEN customer_id:=NEW.user_id; WHEN 'consignment_submissions' THEN customer_id:=NEW.seller_id; END CASE;
  IF customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=customer_id AND account_status='ACTIVE') THEN RAISE EXCEPTION 'Account must be active to create new commerce records' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER orders_active_buyer_guard BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_suspended_account_new_commerce();
CREATE TRIGGER consignment_active_seller_guard BEFORE INSERT ON public.consignment_submissions FOR EACH ROW EXECUTE FUNCTION public.guard_suspended_account_new_commerce();

CREATE FUNCTION public.set_seller_verification(target_account_id UUID,target_status TEXT,operator_note TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('users.manage') THEN RAISE EXCEPTION 'Account management permission required' USING ERRCODE='42501'; END IF;
  IF target_status NOT IN ('UNVERIFIED','PENDING','VERIFIED','REJECTED') OR length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Invalid verification decision'; END IF;
  UPDATE public.seller_profiles SET verification_status=target_status WHERE user_id=target_account_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seller registration not found'; END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'SELLER_VERIFICATION_CHANGED','seller',target_account_id,jsonb_build_object('status',target_status,'reason',btrim(operator_note)));RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.set_seller_verification(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_seller_verification(UUID,TEXT,TEXT) TO authenticated;
