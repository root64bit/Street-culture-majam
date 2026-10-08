CREATE FUNCTION public.respond_to_consignment_request(
  target_submission_id UUID, seller_response TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_submission public.consignment_submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR length(btrim(coalesce(seller_response,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Sign in and provide a response of 10–1000 characters';
  END IF;
  SELECT * INTO current_submission FROM public.consignment_submissions
    WHERE id = target_submission_id FOR UPDATE;
  IF NOT FOUND OR current_submission.seller_id <> auth.uid()
    OR current_submission.status <> 'MORE_INFORMATION_REQUIRED' THEN
    RAISE EXCEPTION 'This consignment is not awaiting your response' USING ERRCODE = '42501';
  END IF;
  UPDATE public.consignment_submissions
  SET status = 'SUBMITTED', seller_notes = concat_ws(E'\n',nullif(seller_notes,''),btrim(seller_response))
  WHERE id = target_submission_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'CONSIGNMENT_SELLER_RESPONSE','consignment',target_submission_id,
    jsonb_build_object('response',btrim(seller_response)));
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.respond_to_consignment_request(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_consignment_request(UUID,TEXT) TO authenticated;
