ALTER TABLE public.products ADD COLUMN archived_at TIMESTAMPTZ,ADD COLUMN meta_title TEXT,ADD COLUMN meta_description TEXT;
ALTER TABLE public.product_variants ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN price_override NUMERIC(12,2) CHECK(price_override IS NULL OR price_override>0);
CREATE INDEX products_workspace_updated_idx ON public.products(updated_at DESC,id);
CREATE INDEX products_category_brand_idx ON public.products(category_id,brand_id);

CREATE FUNCTION public.admin_catalog_products(search_text TEXT DEFAULT '',brand_filter UUID DEFAULT NULL,category_filter UUID DEFAULT NULL,
  status_filter TEXT DEFAULT '',featured_filter BOOLEAN DEFAULT NULL,wanted_filter BOOLEAN DEFAULT NULL,sort_by TEXT DEFAULT 'updated',page_offset INTEGER DEFAULT 0,page_limit INTEGER DEFAULT 30)
RETURNS TABLE(id UUID,name TEXT,slug TEXT,brand_name TEXT,category_name TEXT,style_code TEXT,sku TEXT,active BOOLEAN,archived_at TIMESTAMPTZ,
  featured BOOLEAN,most_wanted BOOLEAN,updated_at TIMESTAMPTZ,image_path TEXT,variants_count BIGINT,live_count BIGINT,lowest_price NUMERIC,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('products.read') THEN RAISE EXCEPTION 'Catalog read permission required' USING ERRCODE='42501'; END IF;
  IF length(search_text)>120 OR status_filter NOT IN ('','active','draft','archived') OR sort_by NOT IN ('updated','name','price')
    OR page_offset<0 OR page_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid catalog query'; END IF;
  RETURN QUERY WITH matched AS (
    SELECT product.*,brand.name AS brand_name,category.name AS category_name,count(*) OVER() AS result_count
      FROM public.products product JOIN public.brands brand ON brand.id=product.brand_id JOIN public.categories category ON category.id=product.category_id
      WHERE (search_text='' OR product.name ILIKE '%'||search_text||'%' OR product.style_code ILIKE '%'||search_text||'%' OR product.sku ILIKE '%'||search_text||'%')
        AND(brand_filter IS NULL OR product.brand_id=brand_filter) AND(category_filter IS NULL OR product.category_id=category_filter)
        AND(featured_filter IS NULL OR product.featured=featured_filter) AND(wanted_filter IS NULL OR product.most_wanted=wanted_filter)
        AND(status_filter='' OR(status_filter='archived' AND product.archived_at IS NOT NULL)
          OR(status_filter='active' AND product.active AND product.archived_at IS NULL) OR(status_filter='draft' AND NOT product.active AND product.archived_at IS NULL))
  ) SELECT matched.id,matched.name,matched.slug,matched.brand_name,matched.category_name,matched.style_code,matched.sku,matched.active,matched.archived_at,
    matched.featured,matched.most_wanted,matched.updated_at,
    (SELECT media.storage_path FROM public.product_media media WHERE media.product_id=matched.id ORDER BY media.sort_order,media.id LIMIT 1),
    (SELECT count(*) FROM public.product_variants variant WHERE variant.product_id=matched.id),
    (SELECT count(*) FROM public.listings listing WHERE listing.product_id=matched.id AND listing.status='LIVE'),
    (SELECT min(listing.asking_price) FROM public.listings listing WHERE listing.product_id=matched.id AND listing.status='LIVE' AND listing.currency='MZN'),matched.result_count
    FROM matched ORDER BY CASE WHEN sort_by='name' THEN matched.name END,
      CASE WHEN sort_by='price' THEN (SELECT min(l.asking_price) FROM public.listings l WHERE l.product_id=matched.id AND l.status='LIVE' AND l.currency='MZN') END,
      matched.updated_at DESC,matched.id OFFSET page_offset LIMIT page_limit;
END; $$;
REVOKE ALL ON FUNCTION public.admin_catalog_products(TEXT,UUID,UUID,TEXT,BOOLEAN,BOOLEAN,TEXT,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_catalog_products(TEXT,UUID,UUID,TEXT,BOOLEAN,BOOLEAN,TEXT,INTEGER,INTEGER) TO authenticated;

CREATE FUNCTION public.bulk_product_operation(product_ids UUID[],catalog_action TEXT,operator_note TEXT) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE product_record public.products%ROWTYPE;changed INTEGER:=0;
BEGIN
  IF NOT public.has_capability('products.write') THEN RAISE EXCEPTION 'Catalog write permission required' USING ERRCODE='42501'; END IF;
  IF cardinality(product_ids) NOT BETWEEN 1 AND 100 OR length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000
    OR catalog_action NOT IN ('FEATURE','UNFEATURE','MOST_WANTED','REMOVE_MOST_WANTED','ARCHIVE','RESTORE_DRAFT') THEN RAISE EXCEPTION 'Invalid bulk operation'; END IF;
  IF catalog_action='ARCHIVE' THEN
    IF NOT public.has_capability('inventory.manage') THEN RAISE EXCEPTION 'Inventory permission required' USING ERRCODE='42501'; END IF;
    PERFORM 1 FROM public.listings WHERE product_id=ANY(product_ids) ORDER BY id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.listings WHERE product_id=ANY(product_ids) AND status IN ('LIVE','RESERVED')) THEN
      RAISE EXCEPTION 'Deactivate live inventory first; reserved products cannot be archived'; END IF;
  END IF;
  FOR product_record IN SELECT * FROM public.products WHERE id=ANY(product_ids) ORDER BY id FOR UPDATE LOOP
    UPDATE public.products SET
      featured=CASE WHEN catalog_action='FEATURE' THEN TRUE WHEN catalog_action='UNFEATURE' THEN FALSE ELSE featured END,
      most_wanted=CASE WHEN catalog_action='MOST_WANTED' THEN TRUE WHEN catalog_action='REMOVE_MOST_WANTED' THEN FALSE ELSE most_wanted END,
      active=CASE WHEN catalog_action IN ('ARCHIVE','RESTORE_DRAFT') THEN FALSE ELSE active END,
      archived_at=CASE WHEN catalog_action='ARCHIVE' THEN NOW() WHEN catalog_action='RESTORE_DRAFT' THEN NULL ELSE archived_at END WHERE products.id=product_record.id;
    INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'PRODUCT_'||catalog_action,'product',product_record.id,jsonb_build_object('reason',btrim(operator_note)));
    changed:=changed+1;
  END LOOP;
  IF changed<>cardinality(ARRAY(SELECT DISTINCT unnest(product_ids))) THEN RAISE EXCEPTION 'Some selected products were not found'; END IF;
  RETURN changed;
END; $$;
REVOKE ALL ON FUNCTION public.bulk_product_operation(UUID[],TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_product_operation(UUID[],TEXT,TEXT) TO authenticated;

CREATE FUNCTION public.generate_product_size_range(target_product_id UUID,target_system TEXT,start_size NUMERIC,end_size NUMERIC,size_increment NUMERIC,
  sku_prefix TEXT DEFAULT '',variant_color TEXT DEFAULT '') RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE value NUMERIC;size_label TEXT;new_count INTEGER:=0;
BEGIN
  IF NOT public.has_capability('products.write') THEN RAISE EXCEPTION 'Catalog write permission required' USING ERRCODE='42501'; END IF;
  IF target_system NOT IN ('US','UK','EU','CM','ONE_SIZE') OR start_size IS NULL OR end_size IS NULL OR size_increment IS NULL
    OR start_size<0 OR end_size<start_size OR end_size>100 OR size_increment NOT IN (0.5,1) OR (end_size-start_size)/size_increment>100
    OR length(sku_prefix)>70 OR length(variant_color)>100 THEN RAISE EXCEPTION 'Invalid size range'; END IF;
  PERFORM 1 FROM public.products WHERE id=target_product_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  FOR value IN SELECT generate_series(start_size,end_size,size_increment) LOOP
    size_label:=CASE WHEN target_system='ONE_SIZE' THEN 'ONE_SIZE' ELSE trim(trailing '.' FROM trim(trailing '0' FROM value::TEXT||CASE WHEN scale(value)=0 THEN '.0' ELSE '' END)) END;
    IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE product_id=target_product_id AND size=size_label
      AND size_system=CASE WHEN target_system='ONE_SIZE' THEN 'STANDARD' ELSE target_system END AND coalesce(color,'')=variant_color) THEN
      INSERT INTO public.product_variants(product_id,size,size_system,sku,color)
      VALUES(target_product_id,size_label,CASE WHEN target_system='ONE_SIZE' THEN 'STANDARD' ELSE target_system END,
        CASE WHEN sku_prefix<>'' THEN sku_prefix||'-'||replace(size_label,'.','_') ELSE NULL END,nullif(variant_color,''));new_count:=new_count+1;
    END IF;
    IF target_system='ONE_SIZE' THEN EXIT; END IF;
  END LOOP;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'SIZE_RANGE_GENERATED','product',target_product_id,jsonb_build_object('system',target_system,'created',new_count));
  RETURN new_count;
END; $$;
REVOKE ALL ON FUNCTION public.generate_product_size_range(UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_product_size_range(UUID,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT) TO authenticated;

CREATE FUNCTION public.reorder_product_media(target_product_id UUID,ordered_media_ids UUID[]) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item_id UUID;position INTEGER:=0;
BEGIN
  IF NOT public.has_capability('media.manage') THEN RAISE EXCEPTION 'Media permission required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.products WHERE id=target_product_id FOR UPDATE;
  IF cardinality(ordered_media_ids)>100 OR (SELECT count(*) FROM public.product_media WHERE product_id=target_product_id)<>cardinality(ordered_media_ids)
    OR cardinality(ARRAY(SELECT DISTINCT unnest(ordered_media_ids)))<>cardinality(ordered_media_ids) THEN RAISE EXCEPTION 'Complete media order required'; END IF;
  FOREACH item_id IN ARRAY ordered_media_ids LOOP
    UPDATE public.product_media SET sort_order=position WHERE id=item_id AND product_id=target_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Media not found'; END IF;position:=position+1;
  END LOOP;RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.reorder_product_media(UUID,UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_product_media(UUID,UUID[]) TO authenticated;
