CREATE OR REPLACE FUNCTION public.admin_product_pricing(target_product_id UUID)
RETURNS TABLE(lowest_live NUMERIC,highest_live NUMERIC,live_units BIGINT,recent_sale NUMERIC,recent_sale_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('products.read') THEN RAISE EXCEPTION 'Catalog permission required' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT min(l.asking_price),max(l.asking_price),count(*),
    (SELECT oi.unit_price*oi.quantity FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.product_id=target_product_id AND o.payment_status='PAID' AND o.status<>'REFUNDED' ORDER BY o.created_at DESC,oi.id LIMIT 1),
    (SELECT o.created_at FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.product_id=target_product_id AND o.payment_status='PAID' AND o.status<>'REFUNDED' ORDER BY o.created_at DESC,oi.id LIMIT 1)
    FROM public.listings l WHERE l.product_id=target_product_id AND l.status='LIVE' AND l.currency='MZN';
END; $$;
REVOKE ALL ON FUNCTION public.admin_product_pricing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_product_pricing(UUID) TO authenticated;
