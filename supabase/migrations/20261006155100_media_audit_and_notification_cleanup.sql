CREATE FUNCTION public.record_media_removal(asset_bucket TEXT,asset_path TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('media.manage') OR asset_bucket NOT IN ('product-images','brand-assets','editorial-assets') OR length(asset_path) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Media permission required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,metadata) VALUES(auth.uid(),'UNUSED_ASSET_REMOVED','media',jsonb_build_object('bucket',asset_bucket,'path',asset_path));
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.record_media_removal(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_media_removal(TEXT,TEXT) TO authenticated;
CREATE FUNCTION public.remove_deleted_record_notifications() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  DELETE FROM public.admin_operational_notifications WHERE event_key LIKE TG_TABLE_NAME||':'||OLD.id::TEXT||':%';RETURN OLD;
END; $$;
CREATE TRIGGER orders_remove_notification AFTER DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_record_notifications();
CREATE TRIGGER payments_remove_notification AFTER DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_record_notifications();
CREATE TRIGGER consignments_remove_notification AFTER DELETE ON public.consignment_submissions FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_record_notifications();
CREATE TRIGGER authentication_remove_notification AFTER DELETE ON public.authentication_records FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_record_notifications();
CREATE TRIGGER payouts_remove_notification AFTER DELETE ON public.seller_payouts FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_record_notifications();
CREATE TRIGGER imports_remove_notification AFTER DELETE ON public.product_import_batches FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_record_notifications();
CREATE TRIGGER listings_remove_notification AFTER DELETE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_record_notifications();
