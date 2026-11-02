-- SC-024 role tests exposed a historical replacement that omitted its guard.
-- Preserve the existing diagnostics implementation and restore its access gate.
ALTER FUNCTION public.admin_product_publication_diagnostics(UUID) RENAME TO admin_product_publication_diagnostics_internal;
REVOKE ALL ON FUNCTION public.admin_product_publication_diagnostics_internal(UUID) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.admin_product_publication_diagnostics(target_product_id UUID)
RETURNS TABLE(stage TEXT,publicly_visible BOOLEAN,blocker_codes TEXT[],blocker_messages TEXT[],
 media_count BIGINT,active_variant_count BIGINT,draft_listing_count BIGINT,live_listing_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.has_capability('products.read') THEN
  RAISE EXCEPTION 'Catalog read permission required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT * FROM public.admin_product_publication_diagnostics_internal(target_product_id);
END; $$;
REVOKE ALL ON FUNCTION public.admin_product_publication_diagnostics(UUID) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_product_publication_diagnostics(UUID) TO authenticated;
