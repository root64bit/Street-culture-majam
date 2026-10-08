INSERT INTO public.role_capabilities(role,capability) SELECT role,'customers.notes'
  FROM public.role_capabilities WHERE capability='customers.read' ON CONFLICT DO NOTHING;
INSERT INTO public.role_capabilities(role,capability) SELECT role,'sellers.notes'
  FROM public.role_capabilities WHERE capability='sellers.read' ON CONFLICT DO NOTHING;

CREATE TABLE public.account_operator_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context TEXT NOT NULL CHECK (context IN ('customer','seller')),
  note TEXT NOT NULL CHECK (length(btrim(note)) BETWEEN 10 AND 2000),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.account_operator_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Account operator note readers" ON public.account_operator_notes FOR SELECT TO authenticated
  USING ((context='customer' AND public.has_capability('customers.read')) OR (context='seller' AND public.has_capability('sellers.read')));
CREATE INDEX account_notes_account_created_idx ON public.account_operator_notes(account_id,created_at DESC);

CREATE FUNCTION public.admin_account_directory(directory_kind TEXT,search_text TEXT DEFAULT '',status_filter TEXT DEFAULT '',page_offset INTEGER DEFAULT 0,page_limit INTEGER DEFAULT 30)
RETURNS TABLE(id UUID,email TEXT,full_name TEXT,phone TEXT,account_status TEXT,verification_status TEXT,
  orders_count BIGINT,lifetime_spend NUMERIC,wishlist_count BIGINT,last_order_at TIMESTAMPTZ,
  active_listings BIGINT,sold_listings BIGINT,gross_sales NUMERIC,pending_payouts NUMERIC,total_paid NUMERIC,
  consignments_count BIGINT,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF directory_kind NOT IN ('customer','seller') OR NOT public.has_capability(CASE directory_kind WHEN 'customer' THEN 'customers.read' ELSE 'sellers.read' END) THEN
    RAISE EXCEPTION 'Directory permission required' USING ERRCODE='42501'; END IF;
  IF page_offset<0 OR page_limit NOT BETWEEN 1 AND 100 OR length(search_text)>120
    OR status_filter NOT IN ('','ACTIVE','SUSPENDED','BANNED','PENDING') THEN RAISE EXCEPTION 'Invalid directory query'; END IF;
  RETURN QUERY WITH matched AS (
    SELECT profile.*,account.email::TEXT,coalesce(seller.verification_status,'NOT_REGISTERED') AS verification_status,count(*) OVER() AS result_count
    FROM public.profiles profile JOIN auth.users account ON account.id=profile.id
    LEFT JOIN public.seller_profiles seller ON seller.user_id=profile.id
    WHERE (directory_kind='customer' OR seller.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.consignment_submissions sub WHERE sub.seller_id=profile.id))
      AND (status_filter='' OR profile.account_status=status_filter)
      AND (btrim(search_text)='' OR account.email ILIKE '%'||btrim(search_text)||'%' OR profile.full_name ILIKE '%'||btrim(search_text)||'%'
        OR profile.phone ILIKE '%'||btrim(search_text)||'%' OR profile.id::TEXT=btrim(search_text))
    ORDER BY profile.created_at DESC,profile.id OFFSET page_offset LIMIT page_limit
  ) SELECT matched.id,matched.email,coalesce(matched.full_name,matched.display_name,'Unnamed account'),matched.phone,matched.account_status,matched.verification_status,
    (SELECT count(*) FROM public.orders o WHERE o.user_id=matched.id),
    coalesce((SELECT sum(o.total_amount) FROM public.orders o WHERE o.user_id=matched.id AND o.payment_status='PAID' AND o.currency='MZN'),0),
    (SELECT count(*) FROM public.wishlist_items w WHERE w.user_id=matched.id),
    (SELECT max(o.created_at) FROM public.orders o WHERE o.user_id=matched.id),
    (SELECT count(*) FROM public.listings l WHERE l.seller_id=matched.id AND l.status IN ('LIVE','RESERVED')),
    (SELECT count(*) FROM public.listings l WHERE l.seller_id=matched.id AND l.status='SOLD'),
    coalesce((SELECT sum(p.gross_amount) FROM public.seller_payouts p WHERE p.seller_id=matched.id AND p.currency='MZN'),0),
    coalesce((SELECT sum(p.net_amount) FROM public.seller_payouts p WHERE p.seller_id=matched.id AND p.currency='MZN' AND p.status IN ('PENDING','APPROVED','PROCESSING','FAILED')),0),
    coalesce((SELECT sum(p.net_amount) FROM public.seller_payouts p WHERE p.seller_id=matched.id AND p.currency='MZN' AND p.status='PAID'),0),
    (SELECT count(*) FROM public.consignment_submissions s WHERE s.seller_id=matched.id),matched.result_count FROM matched;
END; $$;
REVOKE ALL ON FUNCTION public.admin_account_directory(TEXT,TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_account_directory(TEXT,TEXT,TEXT,INTEGER,INTEGER) TO authenticated;

CREATE FUNCTION public.add_account_operator_note(target_account_id UUID,note_context TEXT,operator_note TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE created_id UUID;
BEGIN
  IF note_context NOT IN ('customer','seller') OR NOT public.has_capability(CASE note_context WHEN 'customer' THEN 'customers.notes' ELSE 'sellers.notes' END) THEN
    RAISE EXCEPTION 'Account notes permission required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.account_operator_notes(account_id,context,note,created_by) VALUES(target_account_id,note_context,btrim(operator_note),auth.uid()) RETURNING id INTO created_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'ACCOUNT_NOTE_ADDED',note_context,target_account_id,jsonb_build_object('note_id',created_id));
  RETURN created_id;
END; $$;
REVOKE ALL ON FUNCTION public.add_account_operator_note(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_account_operator_note(UUID,TEXT,TEXT) TO authenticated;

CREATE FUNCTION public.set_customer_account_status(target_account_id UUID,new_status TEXT,operator_note TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_status TEXT;
BEGIN
  IF NOT public.has_capability('users.manage') THEN RAISE EXCEPTION 'Superadmin permission required' USING ERRCODE='42501'; END IF;
  IF new_status NOT IN ('ACTIVE','SUSPENDED','BANNED') OR length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Status and reason required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(6391042);
  SELECT account_status INTO old_status FROM public.profiles WHERE id=target_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF new_status<>'ACTIVE' AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=target_account_id AND role='SUPER_ADMIN')
    AND NOT EXISTS(SELECT 1 FROM public.user_roles role JOIN public.profiles profile ON profile.id=role.user_id
      WHERE role.role='SUPER_ADMIN' AND profile.id<>target_account_id AND profile.account_status='ACTIVE' AND NOT profile.admin_access_disabled) THEN
    RAISE EXCEPTION 'The last active superadmin must remain active'; END IF;
  UPDATE public.profiles SET account_status=new_status WHERE id=target_account_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    VALUES(auth.uid(),'ACCOUNT_STATUS_CHANGED','user',target_account_id,jsonb_build_object('from',old_status,'to',new_status,'reason',btrim(operator_note)));
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.set_customer_account_status(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_customer_account_status(UUID,TEXT,TEXT) TO authenticated;
