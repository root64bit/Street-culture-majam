DROP POLICY "Catalog writers manage products" ON public.products;
CREATE POLICY "Catalog writers insert products" ON public.products FOR INSERT TO authenticated WITH CHECK(public.has_capability('products.write'));
CREATE POLICY "Catalog writers update products" ON public.products FOR UPDATE TO authenticated USING(public.has_capability('products.write')) WITH CHECK(public.has_capability('products.write'));
CREATE POLICY "Catalog readers read all products" ON public.products FOR SELECT TO authenticated USING(public.has_capability('products.read'));
DROP POLICY "Catalog writers manage variants" ON public.product_variants;
CREATE POLICY "Catalog writers insert variants" ON public.product_variants FOR INSERT TO authenticated WITH CHECK(public.has_capability('products.write'));
CREATE POLICY "Catalog writers update variants" ON public.product_variants FOR UPDATE TO authenticated USING(public.has_capability('products.write')) WITH CHECK(public.has_capability('products.write'));
CREATE POLICY "Catalog readers read all variants" ON public.product_variants FOR SELECT TO authenticated USING(public.has_capability('products.read'));

CREATE OR REPLACE FUNCTION public.create_staff_inventory_draft(target_product_id UUID,target_size TEXT,target_size_system TEXT,target_condition TEXT,target_asking_price NUMERIC)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE created_variant_id UUID;created_listing_id UUID;
BEGIN
  IF NOT public.has_capability('inventory.manage') THEN RAISE EXCEPTION 'Inventory permission required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(target_size,''))) NOT BETWEEN 1 AND 24 OR target_size_system NOT IN ('US','UK','EU','CM','STANDARD') OR target_condition NOT IN ('NEW','LIKE_NEW','GOOD','FAIR') OR target_asking_price IS NULL OR target_asking_price<=0 OR target_asking_price>9999999999.99 OR target_asking_price<>round(target_asking_price,2) THEN RAISE EXCEPTION 'Invalid physical inventory details'; END IF;
  PERFORM 1 FROM public.products WHERE id=target_product_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Available catalog product not found'; END IF;
  SELECT id INTO created_variant_id FROM public.product_variants WHERE product_id=target_product_id AND size=btrim(target_size) AND size_system=target_size_system AND color IS NULL AND active ORDER BY id LIMIT 1;
  IF created_variant_id IS NULL THEN INSERT INTO public.product_variants(product_id,size,size_system) VALUES(target_product_id,btrim(target_size),target_size_system) RETURNING id INTO created_variant_id; END IF;
  INSERT INTO public.listings(product_id,variant_id,seller_id,ownership_type,condition,status,asking_price,currency,quantity,authentication_status)
    VALUES(target_product_id,created_variant_id,NULL,'STREET_CULTURE',target_condition,'DRAFT',target_asking_price,'MZN',1,'PENDING') RETURNING id INTO created_listing_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'INVENTORY_DRAFT_CREATED','listing',created_listing_id,jsonb_build_object('product_id',target_product_id));RETURN created_listing_id;
END; $$;
