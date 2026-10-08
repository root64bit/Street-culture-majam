CREATE UNIQUE INDEX consignment_one_listing_idx ON public.listings(consignment_submission_id)
  WHERE consignment_submission_id IS NOT NULL;

CREATE FUNCTION public.manage_inventory_listing(target_listing_id UUID,inventory_action TEXT,operator_note TEXT,new_price NUMERIC DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.listings%ROWTYPE; linked_order public.orders%ROWTYPE; expired_order_id UUID;
BEGIN
  IF NOT public.has_capability('inventory.manage') THEN RAISE EXCEPTION 'Inventory permission required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF inventory_action='RELEASE_EXPIRED' THEN
    SELECT reserved_by_order_id INTO expired_order_id FROM public.listings WHERE id=target_listing_id;
    IF expired_order_id IS NULL THEN RAISE EXCEPTION 'No linked reservation'; END IF;
    -- Use payment -> sorted listings -> order lock order, matching settlement.
    PERFORM 1 FROM public.payments WHERE order_id=expired_order_id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.listings WHERE reserved_by_order_id=expired_order_id ORDER BY id FOR UPDATE;
    SELECT * INTO linked_order FROM public.orders WHERE id=expired_order_id FOR UPDATE;
    SELECT * INTO item FROM public.listings WHERE id=target_listing_id FOR UPDATE;
    IF NOT FOUND OR item.reserved_by_order_id IS DISTINCT FROM expired_order_id OR item.status<>'RESERVED'
      OR item.reservation_expires_at IS NULL OR item.reservation_expires_at>NOW()
      OR linked_order.payment_status='PAID' OR EXISTS (SELECT 1 FROM public.payments WHERE order_id=expired_order_id AND status='SUCCEEDED') THEN
      RAISE EXCEPTION 'Reservation is not safely releasable'; END IF;
    UPDATE public.orders SET status='CANCELLED',payment_status='FAILED' WHERE id=expired_order_id AND status='PENDING';
    UPDATE public.consignment_submissions SET status='LISTED' WHERE id IN (
      SELECT consignment_submission_id FROM public.listings WHERE reserved_by_order_id=expired_order_id AND status='RESERVED');
    UPDATE public.listings SET status='LIVE',reserved_at=NULL,reservation_expires_at=NULL,reserved_by_order_id=NULL
      WHERE reserved_by_order_id=expired_order_id AND status='RESERVED';
    INSERT INTO public.order_events(order_id,event_type,created_by) VALUES(expired_order_id,'RESERVATION_EXPIRED',auth.uid());
  ELSE
    SELECT * INTO item FROM public.listings WHERE id=target_listing_id FOR UPDATE;
    IF NOT FOUND OR item.status IN ('RESERVED','SOLD','RETURNED') OR item.sold_at IS NOT NULL OR item.reserved_by_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'Reserved, sold or returned inventory cannot be edited'; END IF;
    IF inventory_action='ADJUST_PRICE' AND item.status IN ('DRAFT','LIVE','APPROVED') THEN
      IF new_price IS NULL OR new_price<=0 OR new_price>9999999999.99 OR new_price<>round(new_price,2) THEN RAISE EXCEPTION 'Invalid price'; END IF;
      UPDATE public.listings SET asking_price=new_price WHERE id=item.id;
    ELSIF inventory_action='DEACTIVATE' AND item.status='LIVE' THEN
      UPDATE public.listings SET status='DRAFT',published_at=NULL WHERE id=item.id;
      UPDATE public.consignment_submissions SET status='READY_TO_LIST' WHERE id=item.consignment_submission_id AND status='LISTED';
    ELSIF inventory_action='ARCHIVE' AND item.status IN ('DRAFT','APPROVED','REJECTED') THEN
      UPDATE public.listings SET status='ARCHIVED',published_at=NULL WHERE id=item.id;
    ELSIF inventory_action='RESTORE_DRAFT' AND item.status='ARCHIVED' THEN
      UPDATE public.listings SET status='DRAFT' WHERE id=item.id;
    ELSIF inventory_action='ACTIVATE' AND item.status IN ('DRAFT','APPROVED') AND item.authentication_status='PASSED'
      AND item.quantity=1 AND item.currency='MZN' AND item.asking_price>0 THEN
      IF NOT EXISTS(SELECT 1 FROM public.products product JOIN public.brands brand ON brand.id=product.brand_id
        JOIN public.categories category ON category.id=product.category_id
        WHERE product.id=item.product_id AND brand.active AND category.active)
        OR NOT EXISTS(SELECT 1 FROM public.product_media media JOIN storage.objects object ON object.bucket_id='product-images' AND object.name=media.storage_path
          WHERE media.product_id=item.product_id AND media.media_type='IMAGE') THEN RAISE EXCEPTION 'Active taxonomy and uploaded photography required'; END IF;
      IF item.ownership_type='CONSIGNMENT' AND NOT EXISTS (SELECT 1 FROM public.consignment_submissions WHERE id=item.consignment_submission_id AND status='READY_TO_LIST') THEN
        RAISE EXCEPTION 'Consignment is not ready to list'; END IF;
      UPDATE public.listings SET status='LIVE',published_at=NOW() WHERE id=item.id;
      UPDATE public.products SET active=TRUE WHERE id=item.product_id;
      UPDATE public.consignment_submissions SET status='LISTED' WHERE id=item.consignment_submission_id;
    ELSE RAISE EXCEPTION 'Invalid inventory transition or missing authentication'; END IF;
    IF inventory_action IN ('DEACTIVATE','ARCHIVE') AND NOT EXISTS (
      SELECT 1 FROM public.listings WHERE product_id=item.product_id AND status IN ('LIVE','RESERVED')) THEN
      UPDATE public.products SET active=FALSE WHERE id=item.product_id;
    END IF;
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'INVENTORY_'||inventory_action,'listing',target_listing_id,
    jsonb_build_object('reason',btrim(operator_note),'old_price',item.asking_price,'new_price',new_price,'from_status',item.status,'order_id',expired_order_id));
  RETURN target_listing_id;
END; $$;
REVOKE ALL ON FUNCTION public.manage_inventory_listing(UUID,TEXT,TEXT,NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_inventory_listing(UUID,TEXT,TEXT,NUMERIC) TO authenticated;

CREATE FUNCTION public.create_consignment_listing(target_submission_id UUID,target_product_id UUID,target_variant_id UUID,selling_price NUMERIC,operator_note TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE submission public.consignment_submissions%ROWTYPE; auth_record public.authentication_records%ROWTYPE; created_id UUID;
BEGIN
  IF NOT public.has_capability('consignments.review') OR NOT public.has_capability('inventory.manage') THEN
    RAISE EXCEPTION 'Consignment and inventory permissions required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 OR selling_price IS NULL OR selling_price<=0
    OR selling_price>9999999999.99 OR selling_price<>round(selling_price,2) THEN RAISE EXCEPTION 'A valid price and reason are required'; END IF;
  SELECT * INTO submission FROM public.consignment_submissions WHERE id=target_submission_id FOR UPDATE;
  IF NOT FOUND OR submission.status NOT IN ('AUTHENTICATED','PHOTOGRAPHY','PRICING') OR submission.received_at IS NULL THEN
    RAISE EXCEPTION 'Only received authenticated consignments can be listed'; END IF;
  SELECT * INTO auth_record FROM public.authentication_records WHERE consignment_submission_id=submission.id AND status='PASSED'
    ORDER BY authenticated_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR auth_record.condition_confirmed NOT IN ('NEW','LIKE_NEW','GOOD','FAIR') THEN RAISE EXCEPTION 'Confirmed condition required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE id=target_variant_id AND product_id=target_product_id
    AND size=submission.size AND (size_system=submission.size_system OR (size_system='STANDARD' AND submission.size_system IN ('ONE_SIZE','ONE SIZE','STANDARD')))) THEN
    RAISE EXCEPTION 'Choose a matching catalog variant for the actual item size'; END IF;
  INSERT INTO public.listings(product_id,variant_id,seller_id,ownership_type,condition,status,asking_price,currency,quantity,authentication_status,consignment_submission_id)
  VALUES(target_product_id,target_variant_id,submission.seller_id,'CONSIGNMENT',auth_record.condition_confirmed,'DRAFT',selling_price,'MZN',1,'PASSED',submission.id)
  RETURNING id INTO created_id;
  UPDATE public.authentication_records SET listing_id=created_id WHERE id=auth_record.id;
  UPDATE public.consignment_submissions SET product_id=target_product_id,status='READY_TO_LIST' WHERE id=submission.id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'CONSIGNMENT_LISTING_CREATED','consignment',submission.id,
    jsonb_build_object('listing_id',created_id,'product_id',target_product_id,'variant_id',target_variant_id,'price',selling_price,'reason',btrim(operator_note)));
  RETURN created_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_consignment_listing(UUID,UUID,UUID,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_consignment_listing(UUID,UUID,UUID,NUMERIC,TEXT) TO authenticated;

CREATE FUNCTION public.return_consignment_item(target_submission_id UUID,return_action TEXT,operator_note TEXT)
RETURNS public.consignment_status_enum LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE submission public.consignment_submissions%ROWTYPE; next_status public.consignment_status_enum;
BEGIN
  IF NOT public.has_capability('consignments.review') THEN RAISE EXCEPTION 'Consignment permission required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Return reason required'; END IF;
  SELECT * INTO submission FROM public.consignment_submissions WHERE id=target_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consignment not found'; END IF;
  PERFORM 1 FROM public.listings WHERE consignment_submission_id=submission.id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.listings WHERE consignment_submission_id=submission.id AND status IN ('LIVE','RESERVED','SOLD')) THEN
    RAISE EXCEPTION 'Unpublish the available listing first; reserved/sold items cannot be returned'; END IF;
  IF return_action='REQUEST_RETURN' AND submission.status IN ('RECEIVED','AUTHENTICATION_FAILED','AUTHENTICATED','READY_TO_LIST','REJECTED') THEN next_status:='RETURN_REQUESTED';
  ELSIF return_action='CONFIRM_RETURN' AND submission.status='RETURN_REQUESTED' THEN next_status:='RETURNED';
  ELSE RAISE EXCEPTION 'Invalid return transition'; END IF;
  UPDATE public.consignment_submissions SET status=next_status,internal_notes=concat_ws(E'\n',nullif(internal_notes,''),btrim(operator_note)) WHERE id=submission.id;
  IF next_status='RETURNED' THEN UPDATE public.listings SET status='RETURNED' WHERE consignment_submission_id=submission.id; END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'CONSIGNMENT_'||return_action,'consignment',submission.id,jsonb_build_object('from',submission.status,'to',next_status,'reason',btrim(operator_note)));
  RETURN next_status;
END; $$;
REVOKE ALL ON FUNCTION public.return_consignment_item(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_consignment_item(UUID,TEXT,TEXT) TO authenticated;
