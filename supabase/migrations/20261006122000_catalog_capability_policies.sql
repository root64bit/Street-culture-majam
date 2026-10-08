DROP POLICY "Admins manage products" ON public.products;
DROP POLICY "Admins manage product variants" ON public.product_variants;
DROP POLICY "Admins manage product media" ON public.product_media;
DROP POLICY "Admins manage brands" ON public.brands;
DROP POLICY "Admins manage categories" ON public.categories;
DROP POLICY "Admins manage import batches" ON public.product_import_batches;
DROP POLICY "Admins manage import rows" ON public.product_import_rows;
DROP POLICY "Admins manage product and brand images" ON storage.objects;

CREATE POLICY "Catalog writers manage products" ON public.products FOR ALL TO authenticated
  USING (public.has_capability('products.write')) WITH CHECK (public.has_capability('products.write'));
CREATE POLICY "Catalog writers manage variants" ON public.product_variants FOR ALL TO authenticated
  USING (public.has_capability('products.write')) WITH CHECK (public.has_capability('products.write'));
CREATE POLICY "Media managers manage product media" ON public.product_media FOR ALL TO authenticated
  USING (public.has_capability('media.manage')) WITH CHECK (public.has_capability('media.manage'));
CREATE POLICY "Brand managers manage brands" ON public.brands FOR ALL TO authenticated
  USING (public.has_capability('brands.manage')) WITH CHECK (public.has_capability('brands.manage'));
CREATE POLICY "Category managers manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.has_capability('categories.manage')) WITH CHECK (public.has_capability('categories.manage'));
CREATE POLICY "Import managers manage batches" ON public.product_import_batches FOR ALL TO authenticated
  USING (public.has_capability('products.import')) WITH CHECK (public.has_capability('products.import'));
CREATE POLICY "Import managers manage rows" ON public.product_import_rows FOR ALL TO authenticated
  USING (public.has_capability('products.import')) WITH CHECK (public.has_capability('products.import'));
CREATE POLICY "Media managers manage public assets" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('product-images','brand-assets','editorial-assets') AND public.has_capability('media.manage'))
  WITH CHECK (bucket_id IN ('product-images','brand-assets','editorial-assets') AND public.has_capability('media.manage'));

CREATE FUNCTION public.prevent_live_product_identity_edit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() <> 'service_role' AND OLD.active AND (
    NEW.name IS DISTINCT FROM OLD.name OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.brand_id IS DISTINCT FROM OLD.brand_id OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.model IS DISTINCT FROM OLD.model OR NEW.style_code IS DISTINCT FROM OLD.style_code
    OR NEW.sku IS DISTINCT FROM OLD.sku OR NEW.colorway IS DISTINCT FROM OLD.colorway
    OR NEW.description IS DISTINCT FROM OLD.description
  ) THEN
    RAISE EXCEPTION 'Unpublish live listings before changing product identity' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER products_prevent_live_identity_edit BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.prevent_live_product_identity_edit();

CREATE OR REPLACE FUNCTION public.create_staff_inventory_draft(
  target_product_id UUID, target_size TEXT, target_size_system TEXT,
  target_condition TEXT, target_asking_price NUMERIC
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE created_variant_id UUID; created_listing_id UUID;
BEGIN
  IF NOT public.has_capability('inventory.manage') THEN
    RAISE EXCEPTION 'Inventory management permission required' USING ERRCODE = '42501';
  END IF;
  IF target_size IS NULL OR length(btrim(target_size)) NOT BETWEEN 1 AND 24
     OR target_size_system NOT IN ('US','UK','EU','CM','STANDARD')
     OR target_condition NOT IN ('NEW','LIKE_NEW','GOOD','FAIR')
     OR target_asking_price IS NULL OR target_asking_price <= 0
     OR target_asking_price > 9999999999.99 OR target_asking_price <> round(target_asking_price, 2) THEN
    RAISE EXCEPTION 'Invalid draft inventory details';
  END IF;
  PERFORM 1 FROM public.products WHERE id = target_product_id AND active = FALSE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unpublished product draft not found'; END IF;
  INSERT INTO public.product_variants(product_id,size,size_system)
    VALUES(target_product_id,btrim(target_size),target_size_system) RETURNING id INTO created_variant_id;
  INSERT INTO public.listings(product_id,variant_id,seller_id,ownership_type,condition,status,asking_price,currency,quantity,authentication_status,published_at)
    VALUES(target_product_id,created_variant_id,NULL,'STREET_CULTURE',target_condition,'DRAFT',target_asking_price,'MZN',1,'PENDING',NULL)
    RETURNING id INTO created_listing_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'INVENTORY_DRAFT_CREATED','listing',created_listing_id,jsonb_build_object('product_id',target_product_id));
  RETURN created_listing_id;
END; $$;

CREATE OR REPLACE FUNCTION public.commit_product_import_row(target_row_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row_record public.product_import_rows%ROWTYPE;
  batch_record public.product_import_batches%ROWTYPE;
  payload JSONB;
  variant JSONB;
  created_product_id UUID;
  created_variant_id UUID;
  created_listing_id UUID;
  first_listing_id UUID;
  asking_price NUMERIC;
  variant_price NUMERIC;
  stock_quantity INTEGER;
BEGIN
  IF NOT public.has_capability('products.import') THEN
    RAISE EXCEPTION 'Import permission required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO row_record FROM public.product_import_rows WHERE id = target_row_id FOR UPDATE;
  IF NOT FOUND OR row_record.status <> 'VALID' THEN RAISE EXCEPTION 'Import row is not ready'; END IF;
  SELECT * INTO batch_record FROM public.product_import_batches WHERE id = row_record.batch_id FOR UPDATE;
  IF batch_record.status NOT IN ('READY', 'IMPORTING') OR batch_record.mode <> 'CREATE_ONLY' THEN
    RAISE EXCEPTION 'Only reviewed create-only batches can be committed';
  END IF;
  payload := row_record.normalized_data;
  IF payload->>'currency' <> 'MZN' OR payload->>'ownershipType' <> 'STREET_CULTURE'
     OR payload->>'condition' NOT IN ('NEW','LIKE_NEW','GOOD','FAIR')
     OR jsonb_typeof(payload->'variants') <> 'array'
     OR jsonb_array_length(payload->'variants') = 0
     OR length(coalesce(payload->>'reference','')) NOT BETWEEN 1 AND 100
     OR length(coalesce(payload->>'name','')) NOT BETWEEN 3 AND 160
     OR NOT EXISTS (SELECT 1 FROM public.brands WHERE id = (payload->>'brandId')::uuid AND active)
     OR NOT EXISTS (SELECT 1 FROM public.categories WHERE id = (payload->>'categoryId')::uuid AND active) THEN
    RAISE EXCEPTION 'Staged product data is invalid';
  END IF;
  asking_price := (payload->>'sellingPrice')::numeric;
  IF asking_price <= 0 OR asking_price > 9999999999.99 OR asking_price <> round(asking_price, 2) THEN
    RAISE EXCEPTION 'Invalid asking price';
  END IF;
  INSERT INTO public.products(brand_id,category_id,name,slug,description,model,style_code,colorway,gender,release_year,retail_price,currency,active,featured,most_wanted,import_reference)
  VALUES((payload->>'brandId')::uuid,(payload->>'categoryId')::uuid,payload->>'name',
    (payload->>'slug') || '-' || substr(gen_random_uuid()::text,1,8),
    nullif(payload->>'description',''),nullif(payload->>'model',''),nullif(payload->>'styleCode',''),
    nullif(payload->>'colorway',''),nullif(payload->>'gender',''),nullif(payload->>'releaseYear','')::integer,
    nullif(payload->>'retailPrice','')::numeric,'MZN',FALSE,coalesce((payload->>'featured')::boolean,FALSE),
    coalesce((payload->>'mostWanted')::boolean,FALSE),payload->>'reference')
  RETURNING id INTO created_product_id;
  FOR variant IN SELECT value FROM jsonb_array_elements(payload->'variants') LOOP
    stock_quantity := (variant->>'quantity')::integer;
    variant_price := coalesce(nullif(variant->>'priceOverride','')::numeric, asking_price);
    IF stock_quantity NOT BETWEEN 1 AND 10000 OR variant_price <= 0
       OR variant_price > 9999999999.99 OR variant_price <> round(variant_price,2)
       OR variant->>'sizeSystem' NOT IN ('US','UK','EU','CM','STANDARD')
       OR length(coalesce(variant->>'size','')) NOT BETWEEN 1 AND 24 THEN
      RAISE EXCEPTION 'Invalid staged variant';
    END IF;
    INSERT INTO public.product_variants(product_id,size,size_system,color,sku)
      VALUES(created_product_id,variant->>'size',variant->>'sizeSystem',nullif(variant->>'color',''),nullif(variant->>'sku',''))
      RETURNING id INTO created_variant_id;
    INSERT INTO public.listings(product_id,variant_id,seller_id,ownership_type,condition,status,asking_price,currency,quantity,authentication_status)
      VALUES(created_product_id,created_variant_id,NULL,'STREET_CULTURE',payload->>'condition','DRAFT',variant_price,'MZN',stock_quantity,'PENDING')
      RETURNING id INTO created_listing_id;
    first_listing_id := coalesce(first_listing_id,created_listing_id);
  END LOOP;
  UPDATE public.product_import_rows SET status='IMPORTED',product_id=created_product_id,listing_id=first_listing_id WHERE id=target_row_id;
  UPDATE public.product_import_batches SET imported_rows=imported_rows+1,status='IMPORTING' WHERE id=row_record.batch_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'PRODUCT_IMPORTED','product',created_product_id,jsonb_build_object('batch_id',row_record.batch_id,'row_number',row_record.row_number));
  RETURN jsonb_build_object('product_id',created_product_id,'listing_id',first_listing_id);
END; $$;

CREATE OR REPLACE FUNCTION public.publish_store_listing(target_listing_id UUID, decision_notes TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.listings%ROWTYPE; product_record public.products%ROWTYPE;
BEGIN
  IF NOT public.has_capability('inventory.manage') OR NOT public.has_capability('authentication.review') THEN
    RAISE EXCEPTION 'Inventory and authentication permissions required' USING ERRCODE = '42501';
  END IF;
  IF decision_notes IS NULL OR length(btrim(decision_notes)) NOT BETWEEN 20 AND 1000 THEN
    RAISE EXCEPTION 'Record a 20–1000 character authentication decision';
  END IF;
  SELECT * INTO item FROM public.listings WHERE id = target_listing_id FOR UPDATE;
  IF NOT FOUND OR item.status <> 'DRAFT' OR item.ownership_type <> 'STREET_CULTURE'
     OR item.currency <> 'MZN' OR item.quantity <> 1 OR item.asking_price <= 0 THEN
    RAISE EXCEPTION 'Listing is not eligible for publication';
  END IF;
  SELECT * INTO product_record FROM public.products WHERE id = item.product_id FOR UPDATE;
  IF length(btrim(product_record.name)) < 3 OR NOT EXISTS (
    SELECT 1 FROM public.product_media media
    JOIN storage.objects object ON object.bucket_id = 'product-images' AND object.name = media.storage_path
    WHERE media.product_id = item.product_id AND media.media_type = 'IMAGE'
  ) THEN
    RAISE EXCEPTION 'Product needs an uploaded image in product-images';
  END IF;
  INSERT INTO public.authentication_records(listing_id,authenticator_id,status,condition_confirmed,decision_notes,authenticated_at)
    VALUES(item.id,auth.uid(),'PASSED',item.condition,btrim(decision_notes),now());
  UPDATE public.listings SET authentication_status='PASSED',status='LIVE',published_at=now() WHERE id=item.id;
  UPDATE public.products SET active=TRUE WHERE id=item.product_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'LISTING_PUBLISHED','listing',item.id,jsonb_build_object('product_id',item.product_id));
  RETURN item.id;
END; $$;

CREATE OR REPLACE FUNCTION public.unpublish_store_listing(target_listing_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.listings%ROWTYPE;
BEGIN
  IF NOT public.has_capability('inventory.manage') THEN
    RAISE EXCEPTION 'Inventory management permission required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO item FROM public.listings WHERE id = target_listing_id FOR UPDATE;
  IF NOT FOUND OR item.status <> 'LIVE' OR item.reserved_at IS NOT NULL OR item.sold_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only available live listings can be unpublished';
  END IF;
  UPDATE public.listings SET status='DRAFT',published_at=NULL WHERE id=item.id;
  IF NOT EXISTS (SELECT 1 FROM public.listings WHERE product_id=item.product_id AND status='LIVE') THEN
    UPDATE public.products SET active=FALSE WHERE id=item.product_id;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'LISTING_UNPUBLISHED','listing',item.id,jsonb_build_object('product_id',item.product_id));
  RETURN item.id;
END; $$;
