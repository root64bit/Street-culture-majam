CREATE FUNCTION public.authentication_inspection_template() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.has_capability('authentication.review') THEN RAISE EXCEPTION 'Reviewer permission required' USING ERRCODE='42501'; END IF;
  RETURN (SELECT value->'checklist' FROM public.store_settings WHERE key='authentication');
END; $$;
REVOKE ALL ON FUNCTION public.authentication_inspection_template() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authentication_inspection_template() TO authenticated;
