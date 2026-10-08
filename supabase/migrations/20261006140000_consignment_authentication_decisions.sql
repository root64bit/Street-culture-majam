CREATE FUNCTION public.decide_consignment_authentication(
  target_record_id UUID, auth_action TEXT, decision_note TEXT,
  confirmed_condition TEXT DEFAULT NULL
)
RETURNS public.auth_record_status_enum LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  record_row public.authentication_records%ROWTYPE;
  submission_row public.consignment_submissions%ROWTYPE;
  next_auth public.auth_record_status_enum;
  next_consignment public.consignment_status_enum;
BEGIN
  IF NOT public.has_capability('authentication.review') THEN
    RAISE EXCEPTION 'Authentication review permission required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(decision_note,''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'An inspection note of 10–2000 characters is required';
  END IF;
  SELECT * INTO record_row FROM public.authentication_records WHERE id = target_record_id;
  IF NOT FOUND OR record_row.consignment_submission_id IS NULL THEN
    RAISE EXCEPTION 'Consignment authentication record not found';
  END IF;
  SELECT * INTO submission_row FROM public.consignment_submissions
    WHERE id = record_row.consignment_submission_id FOR UPDATE;
  SELECT * INTO record_row FROM public.authentication_records WHERE id = target_record_id FOR UPDATE;
  IF auth_action = 'START' AND record_row.status = 'PENDING'
    AND submission_row.status = 'AUTHENTICATION_PENDING' THEN
    next_auth := 'IN_REVIEW'; next_consignment := 'AUTHENTICATION_IN_PROGRESS';
  ELSIF auth_action = 'PASS' AND record_row.status = 'IN_REVIEW'
    AND submission_row.status = 'AUTHENTICATION_IN_PROGRESS'
    AND length(btrim(coalesce(confirmed_condition,''))) BETWEEN 2 AND 100 THEN
    next_auth := 'PASSED'; next_consignment := 'AUTHENTICATED';
  ELSIF auth_action = 'FAIL' AND record_row.status = 'IN_REVIEW'
    AND submission_row.status = 'AUTHENTICATION_IN_PROGRESS' THEN
    next_auth := 'FAILED'; next_consignment := 'AUTHENTICATION_FAILED';
  ELSIF auth_action = 'REQUEST_INFO' AND record_row.status = 'IN_REVIEW'
    AND submission_row.status = 'AUTHENTICATION_IN_PROGRESS' THEN
    next_auth := 'MORE_INFORMATION_REQUIRED'; next_consignment := 'MORE_INFORMATION_REQUIRED';
  ELSE
    RAISE EXCEPTION 'Invalid authentication decision or missing condition';
  END IF;
  UPDATE public.authentication_records SET status = next_auth,
    authenticator_id = auth.uid(), decision_notes = btrim(decision_note),
    condition_confirmed = CASE WHEN next_auth = 'PASSED' THEN btrim(confirmed_condition) ELSE condition_confirmed END,
    authenticated_at = CASE WHEN next_auth IN ('PASSED','FAILED') THEN now() ELSE authenticated_at END
  WHERE id = target_record_id;
  UPDATE public.consignment_submissions SET status = next_consignment
    WHERE id = submission_row.id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),concat('AUTHENTICATION_',auth_action),'consignment',submission_row.id,
    jsonb_build_object('record_id',target_record_id,'from',record_row.status,'to',next_auth,
      'condition',CASE WHEN next_auth = 'PASSED' THEN btrim(confirmed_condition) END,
      'note',btrim(decision_note)));
  RETURN next_auth;
END; $$;
REVOKE ALL ON FUNCTION public.decide_consignment_authentication(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_consignment_authentication(UUID,TEXT,TEXT,TEXT) TO authenticated;
