-- Explicit operator action, not an automatic side effect of opening a product.
CREATE FUNCTION public.prepare_product_for_editing(target_product_id UUID,operator_note TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hidden_count INTEGER;
BEGIN
 IF NOT public.has_capability('products.write') OR NOT public.has_capability('inventory.manage') THEN
  RAISE EXCEPTION 'Catalog and inventory permissions required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Operator reason required'; END IF;
 -- Match checkout's deterministic listing lock order. Any concurrent checkout
 -- either reserves first (we refuse) or sees the unpublished listing (it refuses).
 PERFORM 1 FROM public.listings WHERE product_id=target_product_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.products WHERE id=target_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.listings WHERE product_id=target_product_id AND status='RESERVED') THEN
  RAISE EXCEPTION 'A customer reservation is active. Product editing cannot change this order'; END IF;
 UPDATE public.listings SET status='DRAFT',published_at=NULL WHERE product_id=target_product_id AND status='LIVE';
 GET DIAGNOSTICS hidden_count=ROW_COUNT;
 UPDATE public.products SET active=FALSE WHERE id=target_product_id;
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),'PRODUCT_PREPARED_FOR_EDIT','product',target_product_id,
  jsonb_build_object('reason',btrim(operator_note),'unpublished_units',hidden_count));
 RETURN hidden_count;
END; $$;
REVOKE ALL ON FUNCTION public.prepare_product_for_editing(UUID,TEXT) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_product_for_editing(UUID,TEXT) TO authenticated;

-- Keep the existing identity protection, including inactive products that still
-- have an open reservation. History remains in immutable order snapshots.
CREATE OR REPLACE FUNCTION public.prevent_live_product_identity_edit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role()<>'service_role' AND (
  NEW.name IS DISTINCT FROM OLD.name OR NEW.slug IS DISTINCT FROM OLD.slug
  OR NEW.brand_id IS DISTINCT FROM OLD.brand_id OR NEW.category_id IS DISTINCT FROM OLD.category_id
  OR NEW.model IS DISTINCT FROM OLD.model OR NEW.style_code IS DISTINCT FROM OLD.style_code
  OR NEW.sku IS DISTINCT FROM OLD.sku OR NEW.colorway IS DISTINCT FROM OLD.colorway
  OR NEW.description IS DISTINCT FROM OLD.description OR NEW.gender IS DISTINCT FROM OLD.gender
  OR NEW.release_year IS DISTINCT FROM OLD.release_year
 ) AND (OLD.active OR EXISTS(SELECT 1 FROM public.listings WHERE product_id=OLD.id AND status IN ('LIVE','RESERVED'))) THEN
  RAISE EXCEPTION 'Unpublish available listings before editing; reserved products cannot be changed' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_live_product_identity_edit() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.edit_draft_listing_condition(target_listing_id UUID,target_condition TEXT,operator_note TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.listings%ROWTYPE;
BEGIN
 IF NOT public.has_capability('inventory.manage') THEN RAISE EXCEPTION 'Inventory permission required' USING ERRCODE='42501'; END IF;
 IF target_condition NOT IN ('NEW','LIKE_NEW','GOOD','FAIR') OR target_condition IS NULL
  OR length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Condition and operator reason required'; END IF;
 SELECT * INTO item FROM public.listings WHERE id=target_listing_id FOR UPDATE;
 IF NOT FOUND OR item.status<>'DRAFT' OR item.ownership_type<>'STREET_CULTURE' THEN
  RAISE EXCEPTION 'Only unpublished own-stock drafts can change condition; use inspection for consignment items'; END IF;
 IF item.condition=target_condition THEN RETURN TRUE; END IF;
 UPDATE public.listings SET condition=target_condition,authentication_status='PENDING' WHERE id=item.id;
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),'LISTING_CONDITION_CHANGED','listing',item.id,
  jsonb_build_object('reason',btrim(operator_note),'from',item.condition,'to',target_condition,'requires_reinspection',TRUE));
 RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.edit_draft_listing_condition(UUID,TEXT,TEXT) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.edit_draft_listing_condition(UUID,TEXT,TEXT) TO authenticated;
