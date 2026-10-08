DROP POLICY "Sellers can view own consignments" ON public.consignment_submissions;
CREATE POLICY "Seller or consignment operator read" ON public.consignment_submissions
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_capability('consignments.read'));

DROP POLICY "Sellers can update draft consignments" ON public.consignment_submissions;
CREATE POLICY "Seller updates own draft submission" ON public.consignment_submissions
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() AND status = 'DRAFT')
  WITH CHECK (seller_id = auth.uid() AND status IN ('DRAFT','SUBMITTED'));

CREATE FUNCTION public.protect_seller_consignment_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_capability('consignments.review') THEN RETURN NEW; END IF;
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.internal_notes IS DISTINCT FROM OLD.internal_notes
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.received_at IS DISTINCT FROM OLD.received_at
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.status NOT IN ('DRAFT','SUBMITTED') THEN
    RAISE EXCEPTION 'Consignment review fields are not seller-editable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'SUBMITTED' AND OLD.status = 'DRAFT' THEN NEW.submitted_at := now(); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER consignment_protect_review_fields BEFORE UPDATE ON public.consignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_seller_consignment_fields();

DROP POLICY "Consignment media access" ON public.consignment_media;
CREATE POLICY "Seller or reviewer consignment media read" ON public.consignment_media
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.consignment_submissions submission
    WHERE submission.id = consignment_submission_id
      AND (submission.seller_id = auth.uid() OR public.has_capability('consignments.read'))));
DROP POLICY "Consignment media insert" ON public.consignment_media;
CREATE POLICY "Seller draft consignment media insert" ON public.consignment_media
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.consignment_submissions submission
    WHERE submission.id = consignment_submission_id
      AND submission.seller_id = auth.uid() AND submission.status = 'DRAFT'));

DROP POLICY "Authenticators and Staff view authentication records" ON public.authentication_records;
DROP POLICY "Authenticators and admins manage records" ON public.authentication_records;
CREATE POLICY "Authentication reviewer or owner read" ON public.authentication_records
  FOR SELECT TO authenticated USING (
    public.has_capability('authentication.review') OR
    EXISTS (SELECT 1 FROM public.consignment_submissions submission
      WHERE submission.id = consignment_submission_id AND submission.seller_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.listings listing
      WHERE listing.id = listing_id AND listing.seller_id = auth.uid()));

CREATE FUNCTION public.transition_consignment(
  target_submission_id UUID, review_action TEXT, review_notes TEXT
)
RETURNS public.consignment_status_enum LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  submission public.consignment_submissions%ROWTYPE;
  next_status public.consignment_status_enum;
BEGIN
  IF NOT public.has_capability('consignments.review') THEN
    RAISE EXCEPTION 'Consignment review permission required' USING ERRCODE = '42501';
  END IF;
  IF review_action NOT IN ('START_REVIEW','REQUEST_INFO','APPROVE','REJECT','AWAIT_ITEM','MARK_RECEIVED','SEND_TO_AUTH')
    OR length(btrim(coalesce(review_notes,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A valid action and a 10–1000 character reason are required';
  END IF;
  SELECT * INTO submission FROM public.consignment_submissions
  WHERE id = target_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consignment not found'; END IF;
  next_status := CASE
    WHEN review_action = 'START_REVIEW' AND submission.status = 'SUBMITTED' THEN 'UNDER_REVIEW'
    WHEN review_action = 'REQUEST_INFO' AND submission.status = 'UNDER_REVIEW' THEN 'MORE_INFORMATION_REQUIRED'
    WHEN review_action = 'APPROVE' AND submission.status = 'UNDER_REVIEW' THEN 'APPROVED_FOR_DELIVERY'
    WHEN review_action = 'REJECT' AND submission.status = 'UNDER_REVIEW' THEN 'REJECTED'
    WHEN review_action = 'AWAIT_ITEM' AND submission.status = 'APPROVED_FOR_DELIVERY' THEN 'AWAITING_ITEM'
    WHEN review_action = 'MARK_RECEIVED' AND submission.status IN ('APPROVED_FOR_DELIVERY','AWAITING_ITEM','IN_TRANSIT') THEN 'RECEIVED'
    WHEN review_action = 'SEND_TO_AUTH' AND submission.status = 'RECEIVED' THEN 'AUTHENTICATION_PENDING'
    ELSE NULL END;
  IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid consignment status transition'; END IF;
  UPDATE public.consignment_submissions SET status = next_status,
    internal_notes = concat_ws(E'\n',nullif(internal_notes,''),btrim(review_notes)),
    approved_at = CASE WHEN review_action = 'APPROVE' THEN now() ELSE approved_at END,
    received_at = CASE WHEN review_action = 'MARK_RECEIVED' THEN now() ELSE received_at END
  WHERE id = target_submission_id;
  IF review_action = 'SEND_TO_AUTH' THEN
    INSERT INTO public.authentication_records(consignment_submission_id,status)
    VALUES(target_submission_id,'PENDING');
  END IF;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),concat('CONSIGNMENT_',review_action),'consignment',target_submission_id,
    jsonb_build_object('from',submission.status,'to',next_status,'reason',btrim(review_notes)));
  RETURN next_status;
END; $$;
REVOKE ALL ON FUNCTION public.transition_consignment(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_consignment(UUID,TEXT,TEXT) TO authenticated;
