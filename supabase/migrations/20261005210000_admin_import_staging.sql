-- Admin-only staging keeps workbook review separate from the public catalog.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS import_reference TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS most_wanted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS products_import_reference_unique
    ON public.products (import_reference) WHERE import_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.product_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    source_type TEXT NOT NULL CHECK (source_type IN ('EXCEL', 'FOLDER')),
    source_filename TEXT NOT NULL,
    file_sha256 TEXT NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    mode TEXT NOT NULL DEFAULT 'CREATE_ONLY' CHECK (mode IN ('CREATE_ONLY', 'UPDATE_EXISTING', 'CREATE_AND_UPDATE')),
    status TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED', 'VALIDATING', 'READY', 'IMPORTING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')),
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
    invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
    imported_rows INTEGER NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
    failed_rows INTEGER NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS product_import_batches_created_at_idx ON public.product_import_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS product_import_batches_sha_idx ON public.product_import_batches (file_sha256);
CREATE TRIGGER product_import_batches_updated_at BEFORE UPDATE ON public.product_import_batches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.product_import_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.product_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL CHECK (row_number >= 2),
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALID', 'INVALID', 'IMPORTED', 'FAILED', 'SKIPPED')),
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (batch_id, row_number)
);
CREATE INDEX IF NOT EXISTS product_import_rows_batch_status_idx ON public.product_import_rows (batch_id, status);
CREATE TRIGGER product_import_rows_updated_at BEFORE UPDATE ON public.product_import_rows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);

ALTER TABLE public.product_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import batches" ON public.product_import_batches FOR ALL
    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage import rows" ON public.product_import_rows FOR ALL
    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins view audit logs" ON public.admin_audit_logs FOR SELECT
    TO authenticated USING (public.is_admin());

-- STAFF remains read-only for catalog operations, including direct browser
-- Supabase requests. Product edits, taxonomy, and public media need ADMIN.
DROP POLICY IF EXISTS "Staff manage brands" ON public.brands;
DROP POLICY IF EXISTS "Staff manage categories" ON public.categories;
DROP POLICY IF EXISTS "Staff manage products" ON public.products;
DROP POLICY IF EXISTS "Staff manage product media" ON public.product_media;
DROP POLICY IF EXISTS "Staff manage product variants" ON public.product_variants;
CREATE POLICY "Admins manage brands" ON public.brands FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage product media" ON public.product_media FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins manage product variants" ON public.product_variants FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Staff manage product and brand images" ON storage.objects;
CREATE POLICY "Admins manage product and brand images" ON storage.objects FOR ALL TO authenticated
    USING (bucket_id IN ('product-images', 'brand-assets', 'editorial-assets') AND public.is_admin())
    WITH CHECK (bucket_id IN ('product-images', 'brand-assets', 'editorial-assets') AND public.is_admin());

CREATE OR REPLACE FUNCTION public.create_staff_inventory_draft(
    target_product_id UUID, target_size TEXT, target_size_system TEXT,
    target_condition TEXT, target_asking_price NUMERIC
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE created_variant_id UUID; created_listing_id UUID;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
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
    RETURN created_listing_id;
END; $$;

-- One RPC call = one PostgreSQL transaction. A failed group leaves no partial
-- product, variant, or listing. Publication is a separate reviewed operation.
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
    IF auth.uid() IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
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
REVOKE ALL ON FUNCTION public.commit_product_import_row(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_product_import_row(UUID) TO authenticated;
