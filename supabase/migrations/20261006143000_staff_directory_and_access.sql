ALTER TABLE public.profiles ADD COLUMN admin_access_disabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.has_capability(check_capability TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles profile
    JOIN public.user_roles membership ON membership.user_id = profile.id
    JOIN public.role_capabilities permission ON permission.role = membership.role
    WHERE profile.id = auth.uid() AND profile.account_status = 'ACTIVE'
      AND NOT profile.admin_access_disabled AND permission.capability = check_capability);
$$;

CREATE OR REPLACE FUNCTION public.my_capabilities()
RETURNS TABLE(capability TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT permission.capability FROM public.profiles profile
  JOIN public.user_roles membership ON membership.user_id = profile.id
  JOIN public.role_capabilities permission ON permission.role = membership.role
  WHERE profile.id = auth.uid() AND profile.account_status = 'ACTIVE'
    AND NOT profile.admin_access_disabled ORDER BY permission.capability;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_authority_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_capability('users.manage') THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_type IS DISTINCT FROM OLD.account_type
    OR NEW.account_status IS DISTINCT FROM OLD.account_status
    OR NEW.admin_access_disabled IS DISTINCT FROM OLD.admin_access_disabled
    OR NEW.is_verified_seller IS DISTINCT FROM OLD.is_verified_seller THEN
    RAISE EXCEPTION 'Account authority fields are not self-editable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.admin_staff_directory(search_text TEXT DEFAULT '', page_offset INTEGER DEFAULT 0, page_limit INTEGER DEFAULT 30)
RETURNS TABLE(id UUID,email TEXT,full_name TEXT,account_status TEXT,admin_access_disabled BOOLEAN,
  roles TEXT[],permissions TEXT[],last_sign_in_at TIMESTAMPTZ,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.has_capability('roles.read') THEN
    RAISE EXCEPTION 'Staff directory permission required' USING ERRCODE = '42501';
  END IF;
  IF page_offset < 0 OR page_limit NOT BETWEEN 1 AND 100 OR length(search_text) > 120 THEN
    RAISE EXCEPTION 'Invalid directory query';
  END IF;
  RETURN QUERY
  WITH people AS (
    SELECT profile.id,account.email::TEXT,coalesce(profile.full_name,profile.display_name,'Staff account') AS full_name,
      profile.account_status,profile.admin_access_disabled,account.last_sign_in_at,
      ARRAY(SELECT membership.role::TEXT FROM public.user_roles membership WHERE membership.user_id=profile.id
        AND membership.role NOT IN ('CUSTOMER','SELLER') ORDER BY membership.role) AS roles,
      ARRAY(SELECT DISTINCT permission.capability FROM public.user_roles membership
        JOIN public.role_capabilities permission ON permission.role=membership.role
        WHERE membership.user_id=profile.id ORDER BY permission.capability) AS permissions
    FROM public.profiles profile JOIN auth.users account ON account.id=profile.id
    WHERE (btrim(search_text) <> '' AND (account.email ILIKE '%'||btrim(search_text)||'%'
      OR profile.id::TEXT=btrim(search_text) OR profile.full_name ILIKE '%'||btrim(search_text)||'%'))
      OR (btrim(search_text)='' AND EXISTS (SELECT 1 FROM public.user_roles membership
        WHERE membership.user_id=profile.id AND membership.role NOT IN ('CUSTOMER','SELLER')))
  )
  SELECT people.id,people.email,people.full_name,people.account_status,people.admin_access_disabled,
    people.roles,people.permissions,people.last_sign_in_at,count(*) OVER()
  FROM people ORDER BY people.full_name,people.id OFFSET page_offset LIMIT page_limit;
END; $$;
REVOKE ALL ON FUNCTION public.admin_staff_directory(TEXT,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_staff_directory(TEXT,INTEGER,INTEGER) TO authenticated;

CREATE FUNCTION public.set_admin_access(target_user_id UUID,disable_access BOOLEAN,reason TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.has_capability('users.manage') THEN
    RAISE EXCEPTION 'Superadmin permission required' USING ERRCODE = '42501';
  END IF;
  IF disable_access IS NULL OR length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'A reason of 10–500 characters is required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(6391042);
  SELECT * INTO current_profile FROM public.profiles WHERE profiles.id=target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF disable_access AND NOT current_profile.admin_access_disabled
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=target_user_id AND role='SUPER_ADMIN')
    AND (SELECT count(*) FROM public.user_roles membership JOIN public.profiles profile ON profile.id=membership.user_id
      WHERE membership.role='SUPER_ADMIN' AND profile.account_status='ACTIVE' AND NOT profile.admin_access_disabled)<=1 THEN
    RAISE EXCEPTION 'The last active superadmin cannot be disabled';
  END IF;
  UPDATE public.profiles SET admin_access_disabled=disable_access WHERE profiles.id=target_user_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),CASE WHEN disable_access THEN 'ADMIN_ACCESS_DISABLED' ELSE 'ADMIN_ACCESS_ENABLED' END,
    'user',target_user_id,jsonb_build_object('reason',btrim(reason)));
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.set_admin_access(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin_access(UUID,BOOLEAN,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_staff_role(
  target_user_id UUID,target_role public.app_role,grant_role BOOLEAN,reason TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed_rows INTEGER;
BEGIN
  IF NOT public.has_capability('roles.manage') THEN
    RAISE EXCEPTION 'Role management requires superadmin permission' USING ERRCODE='42501';
  END IF;
  IF target_role NOT IN ('SUPER_ADMIN','ADMIN','OPERATIONS','CATALOG_MANAGER','AUTHENTICATOR','FULFILLMENT','FINANCE','SUPPORT','STAFF')
    OR grant_role IS NULL OR length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'Invalid staff role change';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(6391042);
  PERFORM 1 FROM public.profiles WHERE id=target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target account not found'; END IF;
  IF grant_role THEN
    INSERT INTO public.user_roles(user_id,role) VALUES(target_user_id,target_role) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS changed_rows=ROW_COUNT;
  ELSE
    IF target_role='SUPER_ADMIN' AND EXISTS (
      SELECT 1 FROM public.user_roles membership JOIN public.profiles profile ON profile.id=membership.user_id
      WHERE membership.user_id=target_user_id AND membership.role='SUPER_ADMIN'
        AND profile.account_status='ACTIVE' AND NOT profile.admin_access_disabled)
      AND NOT EXISTS (SELECT 1 FROM public.user_roles membership JOIN public.profiles profile ON profile.id=membership.user_id
        WHERE membership.user_id<>target_user_id AND membership.role='SUPER_ADMIN'
          AND profile.account_status='ACTIVE' AND NOT profile.admin_access_disabled) THEN
      RAISE EXCEPTION 'The last active superadmin role cannot be removed';
    END IF;
    DELETE FROM public.user_roles WHERE user_id=target_user_id AND role=target_role;
    GET DIAGNOSTICS changed_rows=ROW_COUNT;
  END IF;
  IF changed_rows>0 THEN
    INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),CASE WHEN grant_role THEN 'ROLE_GRANTED' ELSE 'ROLE_REVOKED' END,
      'user',target_user_id,jsonb_build_object('role',target_role,'reason',btrim(reason)));
  END IF;
  RETURN changed_rows>0;
END; $$;
