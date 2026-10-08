CREATE FUNCTION public.admin_global_search(search_text TEXT)
RETURNS TABLE(kind TEXT,label TEXT,detail TEXT,href TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE term TEXT;
BEGIN
  IF NOT public.has_capability('dashboard.read') THEN RAISE EXCEPTION 'Admin search required' USING ERRCODE='42501'; END IF;
  IF length(btrim(search_text)) NOT BETWEEN 2 AND 120 THEN RETURN; END IF;
  term:='%'||replace(replace(btrim(search_text),'%',''),'_','')||'%';
  RETURN QUERY
    (SELECT 'product'::TEXT,p.name,coalesce(p.style_code,p.sku,''),'/admin/products/'||p.id FROM public.products p
      WHERE public.has_capability('products.read') AND (p.name ILIKE term OR p.style_code ILIKE term OR p.sku ILIKE term OR EXISTS(
        SELECT 1 FROM public.product_variants v WHERE v.product_id=p.id AND v.sku ILIKE term)) ORDER BY p.updated_at DESC LIMIT 6)
    UNION ALL (SELECT 'order'::TEXT,o.order_number,o.status::TEXT,'/admin/orders/'||o.id FROM public.orders o
      WHERE public.has_capability('orders.read') AND (o.order_number ILIKE term OR o.guest_email ILIKE term OR o.guest_phone ILIKE term
        OR EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=o.id AND p.provider_reference ILIKE term)) ORDER BY o.created_at DESC LIMIT 6)
    UNION ALL (SELECT 'customer'::TEXT,coalesce(p.full_name,p.display_name,u.email)::TEXT,u.email::TEXT,'/admin/customers/'||p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id
      WHERE public.has_capability('customers.read') AND (p.full_name ILIKE term OR u.email ILIKE term OR p.phone ILIKE term) ORDER BY p.created_at DESC LIMIT 4)
    UNION ALL (SELECT 'seller'::TEXT,coalesce(p.full_name,p.display_name,u.email)::TEXT,u.email::TEXT,'/admin/sellers/'||p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id
      WHERE public.has_capability('sellers.read') AND (EXISTS(SELECT 1 FROM public.seller_profiles s WHERE s.user_id=p.id) OR EXISTS(SELECT 1 FROM public.consignment_submissions s WHERE s.seller_id=p.id))
        AND (p.full_name ILIKE term OR u.email ILIKE term) ORDER BY p.created_at DESC LIMIT 4)
    UNION ALL (SELECT 'consignment'::TEXT,s.product_name,s.status::TEXT,'/admin/consignments/'||s.id FROM public.consignment_submissions s
      WHERE public.has_capability('consignments.read') AND (s.product_name ILIKE term OR s.brand_name ILIKE term OR s.id::TEXT=btrim(search_text)) ORDER BY s.created_at DESC LIMIT 4)
    UNION ALL (SELECT 'payment'::TEXT,coalesce(p.provider_reference,p.id::TEXT),p.status::TEXT,'/admin/orders/'||p.order_id FROM public.payments p
      WHERE public.has_capability('payments.read') AND (p.provider_reference ILIKE term OR p.id::TEXT=btrim(search_text)) ORDER BY p.created_at DESC LIMIT 4);
END; $$;
REVOKE ALL ON FUNCTION public.admin_global_search(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_global_search(TEXT) TO authenticated;

CREATE FUNCTION public.admin_operational_report(report_kind TEXT,date_from TIMESTAMPTZ,date_to TIMESTAMPTZ,currency_filter TEXT DEFAULT 'MZN',
  brand_filter UUID DEFAULT NULL,category_filter UUID DEFAULT NULL,seller_filter UUID DEFAULT NULL,page_offset INTEGER DEFAULT 0,page_limit INTEGER DEFAULT 30)
RETURNS TABLE(record_id UUID,label TEXT,units BIGINT,amount NUMERIC,currency TEXT,status TEXT,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('reports.read') THEN RAISE EXCEPTION 'Report permission required' USING ERRCODE='42501'; END IF;
  IF report_kind NOT IN ('sales','orders','products','inventory','consignments','payouts','payment_failures') OR date_from IS NULL OR date_to IS NULL OR date_from>date_to
    OR currency_filter NOT IN ('MZN','EUR','ZAR','USD') OR page_offset<0 OR page_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid report filters'; END IF;
  RETURN QUERY WITH eligible_products AS (
    SELECT p.id FROM public.products p WHERE (brand_filter IS NULL OR p.brand_id=brand_filter) AND(category_filter IS NULL OR p.category_id=category_filter)
  ),eligible_orders AS (
    SELECT o.* FROM public.orders o WHERE o.created_at>=date_from AND o.created_at<date_to AND o.currency=currency_filter
      AND ((brand_filter IS NULL AND category_filter IS NULL AND seller_filter IS NULL) OR EXISTS(SELECT 1 FROM public.order_items item
        WHERE item.order_id=o.id AND item.product_id IN(SELECT id FROM eligible_products) AND(seller_filter IS NULL OR item.seller_id=seller_filter)))
  ),rows AS (
    SELECT o.id AS record_id,o.order_number AS label,(SELECT sum(item.quantity)::BIGINT FROM public.order_items item WHERE item.order_id=o.id) AS units,
      o.total_amount AS amount,o.currency,o.status::TEXT AS status FROM eligible_orders o
      WHERE report_kind IN ('sales','orders') AND(report_kind='orders' OR o.payment_status='PAID')
    UNION ALL SELECT p.id,p.name,sum(item.quantity)::BIGINT,sum(item.unit_price*item.quantity),o.currency,'PAID'::TEXT
      FROM public.products p JOIN public.order_items item ON item.product_id=p.id JOIN eligible_orders o ON o.id=item.order_id
      WHERE report_kind='products' AND o.payment_status='PAID' AND p.id IN(SELECT id FROM eligible_products) AND(seller_filter IS NULL OR item.seller_id=seller_filter)
      GROUP BY p.id,p.name,o.currency
    UNION ALL SELECT l.id,p.name,l.quantity::BIGINT,l.asking_price,l.currency,l.status::TEXT FROM public.listings l JOIN public.products p ON p.id=l.product_id
      WHERE report_kind='inventory' AND l.product_id IN(SELECT id FROM eligible_products) AND l.currency=currency_filter AND(seller_filter IS NULL OR l.seller_id=seller_filter)
    UNION ALL SELECT s.id,s.brand_name||' '||s.product_name,1::BIGINT,s.expected_price,s.currency,s.status::TEXT FROM public.consignment_submissions s
      WHERE report_kind='consignments' AND s.currency=currency_filter AND s.created_at>=date_from AND s.created_at<date_to
        AND(seller_filter IS NULL OR s.seller_id=seller_filter) AND(category_filter IS NULL OR s.category_id=category_filter)
        AND(brand_filter IS NULL OR EXISTS(SELECT 1 FROM public.brands b WHERE b.id=brand_filter AND lower(b.name)=lower(s.brand_name)))
    UNION ALL SELECT payout.id,coalesce(item.product_name_snapshot,payout.id::TEXT),1::BIGINT,payout.net_amount,payout.currency,payout.status::TEXT
      FROM public.seller_payouts payout LEFT JOIN public.order_items item ON item.id=payout.order_item_id
      WHERE report_kind='payouts' AND payout.currency=currency_filter AND payout.created_at>=date_from AND payout.created_at<date_to
        AND(seller_filter IS NULL OR payout.seller_id=seller_filter)
        AND((brand_filter IS NULL AND category_filter IS NULL) OR item.product_id IN(SELECT id FROM eligible_products))
    UNION ALL SELECT payment.id,coalesce(payment.provider_reference,payment.id::TEXT),1::BIGINT,payment.amount,payment.currency,payment.status::TEXT
      FROM public.payments payment JOIN eligible_orders o ON o.id=payment.order_id WHERE report_kind='payment_failures' AND payment.status='FAILED'
  ) SELECT rows.record_id,rows.label,coalesce(rows.units,0),rows.amount,rows.currency,rows.status,count(*) OVER() FROM rows
    ORDER BY rows.amount DESC,rows.record_id OFFSET page_offset LIMIT page_limit;
END; $$;
REVOKE ALL ON FUNCTION public.admin_operational_report(TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,UUID,UUID,UUID,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_operational_report(TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,UUID,UUID,UUID,INTEGER,INTEGER) TO authenticated;
