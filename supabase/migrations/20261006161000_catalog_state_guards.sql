CREATE FUNCTION public.protect_variant_inventory_identity() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.size IS DISTINCT FROM OLD.size OR NEW.size_system IS DISTINCT FROM OLD.size_system
    OR NEW.color IS DISTINCT FROM OLD.color OR NEW.sku IS DISTINCT FROM OLD.sku OR NEW.active IS DISTINCT FROM OLD.active) AND EXISTS(
      SELECT 1 FROM public.listings WHERE variant_id=OLD.id AND status IN ('LIVE','RESERVED','SOLD')) THEN
    RAISE EXCEPTION 'Live, reserved or sold variant identity cannot be changed'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER variant_protect_identity BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.protect_variant_inventory_identity();
CREATE FUNCTION public.guard_inventory_publication_catalog() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='LIVE' AND(TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NOT EXISTS(SELECT 1 FROM public.products product JOIN public.product_variants variant ON variant.product_id=product.id
      WHERE product.id=NEW.product_id AND variant.id=NEW.variant_id AND variant.active AND product.archived_at IS NULL) THEN
      RAISE EXCEPTION 'Archived products and inactive variants cannot be published'; END IF;
  END IF;RETURN NEW;
END; $$;
CREATE TRIGGER inventory_catalog_publication_guard BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_publication_catalog();
CREATE FUNCTION public.protect_last_live_product_photo() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.listings WHERE product_id=OLD.product_id AND status IN ('LIVE','RESERVED')) AND NOT EXISTS(
    SELECT 1 FROM public.product_media WHERE product_id=OLD.product_id AND id<>OLD.id AND media_type='IMAGE') THEN
    RAISE EXCEPTION 'Available inventory needs at least one photo. Unpublish first.'; END IF;RETURN OLD;
END; $$;
CREATE TRIGGER media_protect_last_live_photo BEFORE DELETE ON public.product_media FOR EACH ROW EXECUTE FUNCTION public.protect_last_live_product_photo();
