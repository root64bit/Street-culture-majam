CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_unique
  ON public.product_variants (upper(sku)) WHERE sku IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_import_one_of_one()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.quantity > 1 AND EXISTS (
    SELECT 1 FROM public.products WHERE id = NEW.product_id AND import_reference IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Imported products require one-of-one listings';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER listings_import_one_of_one BEFORE INSERT OR UPDATE OF quantity, product_id
  ON public.listings FOR EACH ROW EXECUTE FUNCTION public.enforce_import_one_of_one();

-- Publication needs an explicit, attributable item-level decision. A generic
-- merchant stock declaration does not silently make any import row live.
CREATE OR REPLACE FUNCTION public.publish_store_listing(target_listing_id UUID, decision_notes TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.listings%ROWTYPE; product_record public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
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
REVOKE ALL ON FUNCTION public.publish_store_listing(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_store_listing(UUID,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unpublish_store_listing(target_listing_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE item public.listings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
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
REVOKE ALL ON FUNCTION public.unpublish_store_listing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unpublish_store_listing(UUID) TO authenticated;
