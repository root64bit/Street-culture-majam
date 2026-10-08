ALTER TABLE public.product_media ADD COLUMN storage_object_id UUID REFERENCES storage.objects(id) ON DELETE RESTRICT;
ALTER TABLE public.brands ADD COLUMN logo_object_id UUID REFERENCES storage.objects(id) ON DELETE RESTRICT;
ALTER TABLE public.categories ADD COLUMN image_object_id UUID REFERENCES storage.objects(id) ON DELETE RESTRICT;
UPDATE public.product_media media SET storage_object_id=object.id FROM storage.objects object WHERE object.bucket_id='product-images' AND object.name=media.storage_path;
UPDATE public.brands brand SET logo_object_id=object.id FROM storage.objects object WHERE object.bucket_id='brand-assets' AND object.name=brand.logo_path;
UPDATE public.categories category SET image_object_id=object.id FROM storage.objects object WHERE object.bucket_id='brand-assets' AND object.name=category.image_path;

CREATE FUNCTION public.bind_public_asset_reference() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset_path TEXT;asset_bucket TEXT;object_id UUID;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'product_media' THEN
      asset_path:=NEW.storage_path;asset_bucket:='product-images';
      IF TG_OP='UPDATE' AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path THEN NEW.storage_object_id:=OLD.storage_object_id;RETURN NEW; END IF;
    WHEN 'brands' THEN
      asset_path:=NEW.logo_path;asset_bucket:='brand-assets';
      IF TG_OP='UPDATE' AND NEW.logo_path IS NOT DISTINCT FROM OLD.logo_path THEN NEW.logo_object_id:=OLD.logo_object_id;RETURN NEW; END IF;
    WHEN 'categories' THEN
      asset_path:=NEW.image_path;asset_bucket:='brand-assets';
      IF TG_OP='UPDATE' AND NEW.image_path IS NOT DISTINCT FROM OLD.image_path THEN NEW.image_object_id:=OLD.image_object_id;RETURN NEW; END IF;
  END CASE;
  IF asset_path IS NOT NULL AND asset_path NOT LIKE '/%' THEN
    SELECT id INTO object_id FROM storage.objects WHERE bucket_id=asset_bucket AND name=asset_path FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Upload the asset before attaching its storage path'; END IF;
  END IF;
  CASE TG_TABLE_NAME WHEN 'product_media' THEN NEW.storage_object_id:=object_id;
    WHEN 'brands' THEN NEW.logo_object_id:=object_id;WHEN 'categories' THEN NEW.image_object_id:=object_id;END CASE;
  RETURN NEW;
END; $$;
CREATE TRIGGER product_media_bind_storage BEFORE INSERT OR UPDATE ON public.product_media FOR EACH ROW EXECUTE FUNCTION public.bind_public_asset_reference();
CREATE TRIGGER brands_bind_storage BEFORE INSERT OR UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.bind_public_asset_reference();
CREATE TRIGGER categories_bind_storage BEFORE INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.bind_public_asset_reference();

CREATE FUNCTION public.public_asset_is_unused(asset_bucket TEXT,asset_path TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.has_capability('media.manage') AND asset_bucket IN ('product-images','brand-assets','editorial-assets')
    AND NOT EXISTS(SELECT 1 FROM public.product_media WHERE asset_bucket='product-images' AND storage_path=asset_path)
    AND NOT EXISTS(SELECT 1 FROM public.brands WHERE asset_bucket='brand-assets' AND logo_path=asset_path)
    AND NOT EXISTS(SELECT 1 FROM public.categories WHERE asset_bucket='brand-assets' AND image_path=asset_path);
$$;
REVOKE ALL ON FUNCTION public.public_asset_is_unused(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_asset_is_unused(TEXT,TEXT) TO authenticated;
DROP POLICY "Media managers manage public assets" ON storage.objects;
CREATE POLICY "Media managers upload public assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id IN ('product-images','brand-assets','editorial-assets') AND public.has_capability('media.manage'));
CREATE POLICY "Media managers delete unused public assets" ON storage.objects FOR DELETE TO authenticated
  USING(public.public_asset_is_unused(bucket_id,name));
-- No overwrite policy: replace via a new object, attach it, then remove the old
-- unused object. Foreign keys protect attached files even for service callers.

CREATE FUNCTION public.admin_public_media_library(asset_bucket TEXT DEFAULT 'product-images',search_text TEXT DEFAULT '',page_offset INTEGER DEFAULT 0,page_limit INTEGER DEFAULT 30)
RETURNS TABLE(id UUID,bucket TEXT,path TEXT,bytes BIGINT,mime_type TEXT,created_at TIMESTAMPTZ,usage JSONB,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('media.manage') THEN RAISE EXCEPTION 'Media permission required' USING ERRCODE='42501'; END IF;
  IF asset_bucket NOT IN ('product-images','brand-assets','editorial-assets') OR length(search_text)>120 OR page_offset<0 OR page_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid media query'; END IF;
  RETURN QUERY SELECT object.id,object.bucket_id,object.name,coalesce((object.metadata->>'size')::BIGINT,0),coalesce(object.metadata->>'mimetype','unknown'),object.created_at,
    coalesce((SELECT jsonb_agg(reference) FROM (
      SELECT jsonb_build_object('label',product.name,'href','/admin/products/'||product.id) AS reference FROM public.product_media media JOIN public.products product ON product.id=media.product_id WHERE object.bucket_id='product-images' AND media.storage_path=object.name
      UNION ALL SELECT jsonb_build_object('label',brand.name,'href','/admin/brands') FROM public.brands brand WHERE object.bucket_id='brand-assets' AND brand.logo_path=object.name
      UNION ALL SELECT jsonb_build_object('label',category.name,'href','/admin/categories') FROM public.categories category WHERE object.bucket_id='brand-assets' AND category.image_path=object.name
    ) links),'[]'::JSONB),count(*) OVER() FROM storage.objects object WHERE object.bucket_id=asset_bucket AND object.name ILIKE '%'||replace(replace(search_text,'%',''),'_','')||'%'
    ORDER BY object.created_at DESC,object.id OFFSET page_offset LIMIT page_limit;
END; $$;
REVOKE ALL ON FUNCTION public.admin_public_media_library(TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_public_media_library(TEXT,TEXT,INTEGER,INTEGER) TO authenticated;
