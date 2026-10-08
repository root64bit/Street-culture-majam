ALTER TABLE public.brands ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.commission_rules ADD CONSTRAINT commission_terms_valid CHECK (
  percentage BETWEEN 0 AND 100 AND fixed_fee >= 0 AND minimum_fee >= 0
  AND (ends_at IS NULL OR ends_at > starts_at));
ALTER TABLE public.categories ADD CONSTRAINT category_not_own_parent CHECK (parent_id IS DISTINCT FROM id);

GRANT SELECT ON public.shipping_methods TO anon,authenticated;
CREATE POLICY "Available shipping or shipping operators" ON public.shipping_methods FOR SELECT
  USING (active OR public.has_capability('shipping.read'));

CREATE TABLE public.store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key IN ('store','consignment','authentication','notifications')),
  value JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings readers" ON public.store_settings FOR SELECT TO authenticated
  USING (public.has_capability('settings.read'));
INSERT INTO public.store_settings(key,value) VALUES
 ('store','{"name":"STREET CULTURE","supportEmail":"","supportPhone":""}'),
 ('consignment','{"returnInstructions":"Contact support to arrange return of a rejected item."}'),
 ('authentication','{"checklist":["Materials and construction","Labels and identifiers","Condition and wear","Proof of purchase when available"]}'),
 ('notifications','{"lowStockThreshold":1}');

-- No arbitrary table name or dynamic SQL: each configuration domain has its
-- own capability and a fixed allowlist. Secrets do not belong in this table.
CREATE FUNCTION public.save_admin_configuration(configuration_kind TEXT,target_id UUID,payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved_id UUID; required_capability TEXT; ancestor_id UUID; seen_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  required_capability := CASE configuration_kind
    WHEN 'brand' THEN 'brands.manage' WHEN 'category' THEN 'categories.manage'
    WHEN 'shipping' THEN 'shipping.manage' WHEN 'commission' THEN 'commissions.manage'
    WHEN 'setting' THEN 'settings.manage' END;
  IF required_capability IS NULL OR NOT public.has_capability(required_capability) THEN
    RAISE EXCEPTION 'Configuration permission required' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(payload) <> 'object' THEN RAISE EXCEPTION 'Invalid configuration'; END IF;
  saved_id := coalesce(target_id,gen_random_uuid());
  IF configuration_kind IN ('brand','category','shipping','commission') THEN
    IF length(btrim(coalesce(payload->>'name',''))) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  END IF;
  IF configuration_kind IN ('brand','category') THEN
    IF coalesce(payload->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(payload->>'slug')>160 THEN RAISE EXCEPTION 'Invalid slug'; END IF;
    IF coalesce(payload->>'imagePath','') <> '' AND (payload->>'imagePath' ~ '(^/|\.\.|://)' OR length(payload->>'imagePath')>500) THEN
      RAISE EXCEPTION 'Use a storage asset path'; END IF;
  END IF;
  IF configuration_kind='brand' THEN
    INSERT INTO public.brands(id,name,slug,description,logo_path,featured,active,sort_order)
    VALUES(saved_id,btrim(payload->>'name'),payload->>'slug',nullif(payload->>'description',''),nullif(payload->>'imagePath',''),
      (payload->>'featured')::BOOLEAN,(payload->>'active')::BOOLEAN,(payload->>'sortOrder')::INTEGER)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,description=EXCLUDED.description,
      logo_path=EXCLUDED.logo_path,featured=EXCLUDED.featured,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order;
  ELSIF configuration_kind='category' THEN
    -- Serialize hierarchy edits so concurrent parent changes cannot create a cycle.
    PERFORM pg_catalog.pg_advisory_xact_lock(6391043);
    ancestor_id := nullif(payload->>'parentId','')::UUID;
    WHILE ancestor_id IS NOT NULL LOOP
      IF ancestor_id=saved_id OR ancestor_id=ANY(seen_ids) THEN RAISE EXCEPTION 'Category hierarchy cycle'; END IF;
      seen_ids := array_append(seen_ids,ancestor_id);
      SELECT parent_id INTO ancestor_id FROM public.categories WHERE id=ancestor_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Parent category not found'; END IF;
    END LOOP;
    INSERT INTO public.categories(id,name,slug,description,image_path,parent_id,active,sort_order)
    VALUES(saved_id,btrim(payload->>'name'),payload->>'slug',nullif(payload->>'description',''),nullif(payload->>'imagePath',''),
      nullif(payload->>'parentId','')::UUID,(payload->>'active')::BOOLEAN,(payload->>'sortOrder')::INTEGER)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,description=EXCLUDED.description,
      image_path=EXCLUDED.image_path,parent_id=EXCLUDED.parent_id,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order;
  ELSIF configuration_kind='shipping' THEN
    IF coalesce(payload->>'countryCode','') !~ '^[A-Z]{2}$' OR payload->>'currency'<>'MZN'
      OR coalesce(payload->>'code','') !~ '^[A-Z0-9_]{2,40}$' THEN RAISE EXCEPTION 'Invalid shipping configuration'; END IF;
    INSERT INTO public.shipping_methods(id,code,name,country_code,region,price,currency,estimated_min_days,estimated_max_days,active)
    VALUES(saved_id,payload->>'code',btrim(payload->>'name'),payload->>'countryCode',nullif(payload->>'region',''),
      (payload->>'price')::NUMERIC,'MZN',(payload->>'minDays')::INTEGER,(payload->>'maxDays')::INTEGER,(payload->>'active')::BOOLEAN)
    ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,country_code=EXCLUDED.country_code,
      region=EXCLUDED.region,price=EXCLUDED.price,currency=EXCLUDED.currency,estimated_min_days=EXCLUDED.estimated_min_days,
      estimated_max_days=EXCLUDED.estimated_max_days,active=EXCLUDED.active;
  ELSIF configuration_kind='commission' THEN
    IF payload->>'currency'<>'MZN' OR payload->>'sellerType' NOT IN ('STANDARD','VERIFIED','PROFESSIONAL') THEN
      RAISE EXCEPTION 'Invalid commission configuration'; END IF;
    INSERT INTO public.commission_rules(id,name,seller_type,brand_id,category_id,percentage,fixed_fee,minimum_fee,currency,priority,starts_at,ends_at,active)
    VALUES(saved_id,btrim(payload->>'name'),payload->>'sellerType',nullif(payload->>'brandId','')::UUID,
      nullif(payload->>'categoryId','')::UUID,(payload->>'percentage')::NUMERIC,(payload->>'fixedFee')::NUMERIC,
      (payload->>'minimumFee')::NUMERIC,'MZN',(payload->>'priority')::INTEGER,
      (payload->>'startsAt')::TIMESTAMPTZ,nullif(payload->>'endsAt','')::TIMESTAMPTZ,(payload->>'active')::BOOLEAN)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,seller_type=EXCLUDED.seller_type,brand_id=EXCLUDED.brand_id,
      category_id=EXCLUDED.category_id,percentage=EXCLUDED.percentage,fixed_fee=EXCLUDED.fixed_fee,
      minimum_fee=EXCLUDED.minimum_fee,currency=EXCLUDED.currency,priority=EXCLUDED.priority,
      starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,active=EXCLUDED.active;
  ELSIF configuration_kind='setting' THEN
    IF payload->>'key' NOT IN ('store','consignment','authentication','notifications')
      OR jsonb_typeof(payload->'value')<>'object' OR length((payload->'value')::TEXT)>10000
      OR (payload->'value')::TEXT ~* '(secret|password|token|authorization|api.?key)' THEN
      RAISE EXCEPTION 'Only non-secret operational settings are allowed'; END IF;
    UPDATE public.store_settings SET value=payload->'value',updated_at=NOW(),updated_by=auth.uid()
      WHERE key=payload->>'key' RETURNING id INTO saved_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Setting not found'; END IF;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'CONFIGURATION_SAVED',configuration_kind,saved_id,jsonb_build_object('fields',
      (SELECT jsonb_agg(key) FROM jsonb_object_keys(payload) key),'created',target_id IS NULL));
  RETURN saved_id;
END; $$;
REVOKE ALL ON FUNCTION public.save_admin_configuration(TEXT,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_admin_configuration(TEXT,UUID,JSONB) TO authenticated;

CREATE INDEX audit_actor_created_idx ON public.admin_audit_logs(actor_id,created_at DESC);
CREATE INDEX audit_entity_created_idx ON public.admin_audit_logs(entity_type,entity_id,created_at DESC);
CREATE INDEX audit_action_created_idx ON public.admin_audit_logs(action,created_at DESC);

-- Direct catalog edits are already RLS-restricted; record a safe field-only
-- history without copying descriptions, uploads or personal data into logs.
CREATE FUNCTION public.audit_catalog_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),upper(TG_TABLE_NAME)||'_'||TG_OP,TG_TABLE_NAME,
      CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,
      jsonb_build_object('source','catalog_mutation'));
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();
CREATE TRIGGER audit_variants AFTER INSERT OR UPDATE OR DELETE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();
CREATE TRIGGER audit_product_media AFTER INSERT OR UPDATE OR DELETE ON public.product_media FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();
CREATE TRIGGER audit_brands AFTER INSERT OR UPDATE OR DELETE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();
CREATE TRIGGER audit_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();
