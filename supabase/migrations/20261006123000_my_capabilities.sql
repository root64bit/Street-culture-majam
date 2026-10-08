CREATE FUNCTION public.my_capabilities()
RETURNS TABLE(capability TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT permission.capability
  FROM public.user_roles membership
  JOIN public.role_capabilities permission ON permission.role = membership.role
  JOIN public.profiles profile ON profile.id = membership.user_id
  WHERE membership.user_id = auth.uid() AND profile.account_status = 'ACTIVE'
  ORDER BY permission.capability;
$$;
REVOKE ALL ON FUNCTION public.my_capabilities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_capabilities() TO authenticated;
