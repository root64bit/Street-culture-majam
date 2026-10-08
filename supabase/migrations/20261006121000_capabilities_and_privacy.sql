-- Explicit capabilities replace broad "staff can mutate everything" policies.
CREATE TABLE public.role_capabilities (
  role public.app_role NOT NULL,
  capability TEXT NOT NULL CHECK (capability ~ '^[a-z_]+\.[a-z_]+$'),
  PRIMARY KEY (role, capability)
);
ALTER TABLE public.role_capabilities ENABLE ROW LEVEL SECURITY;

WITH grants(role, capabilities) AS (VALUES
  ('SUPER_ADMIN'::public.app_role, ARRAY[
    'dashboard.read','products.read','products.write','products.import','products.export',
    'inventory.read','inventory.manage','orders.read','orders.update','payments.read','payments.reconcile',
    'consignments.read','consignments.review','authentication.review','sellers.read','customers.read',
    'payouts.read','payouts.approve','payouts.mark_paid','commissions.read','commissions.manage',
    'brands.manage','categories.manage','media.manage','shipping.read','shipping.manage',
    'reports.read','audit.read','users.manage','roles.read','roles.manage','settings.read','settings.manage',
    'notifications.read'
  ]::text[]),
  ('ADMIN'::public.app_role, ARRAY[
    'dashboard.read','products.read','products.write','products.import','products.export',
    'inventory.read','inventory.manage','orders.read','orders.update','payments.read','payments.reconcile',
    'consignments.read','consignments.review','authentication.review','sellers.read','customers.read',
    'payouts.read','payouts.approve','commissions.read','commissions.manage','brands.manage',
    'categories.manage','media.manage','shipping.read','shipping.manage','reports.read','audit.read',
    'roles.read','settings.read','settings.manage','notifications.read'
  ]::text[]),
  ('OPERATIONS'::public.app_role, ARRAY[
    'dashboard.read','products.read','inventory.read','orders.read','orders.update','payments.read',
    'consignments.read','consignments.review','sellers.read','customers.read','shipping.read',
    'shipping.manage','reports.read','notifications.read'
  ]::text[]),
  ('CATALOG_MANAGER'::public.app_role, ARRAY[
    'dashboard.read','products.read','products.write','products.import','products.export',
    'inventory.read','inventory.manage','brands.manage','categories.manage','media.manage'
  ]::text[]),
  ('AUTHENTICATOR'::public.app_role, ARRAY[
    'dashboard.read','products.read','inventory.read','consignments.read','authentication.review'
  ]::text[]),
  ('FULFILLMENT'::public.app_role, ARRAY[
    'dashboard.read','inventory.read','orders.read','orders.update','shipping.read','customers.read'
  ]::text[]),
  ('FINANCE'::public.app_role, ARRAY[
    'dashboard.read','orders.read','payments.read','payments.reconcile','payouts.read',
    'payouts.approve','payouts.mark_paid','commissions.read','commissions.manage',
    'reports.read','audit.read'
  ]::text[]),
  ('SUPPORT'::public.app_role, ARRAY[
    'dashboard.read','orders.read','payments.read','consignments.read','sellers.read',
    'customers.read','notifications.read'
  ]::text[]),
  ('STAFF'::public.app_role, ARRAY['dashboard.read','products.read','inventory.read']::text[])
)
INSERT INTO public.role_capabilities(role, capability)
SELECT grants.role, item.capability FROM grants
CROSS JOIN LATERAL unnest(grants.capabilities) AS item(capability);

CREATE OR REPLACE FUNCTION public.has_capability(check_capability TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'ACTIVE')
    AND EXISTS (
      SELECT 1 FROM public.user_roles membership
      JOIN public.role_capabilities permission ON permission.role = membership.role
      WHERE membership.user_id = auth.uid() AND permission.capability = check_capability
    );
$$;
REVOKE ALL ON FUNCTION public.has_capability(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_capability(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_capability('products.write') AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN','SUPER_ADMIN')
  );
$$;
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_capability('dashboard.read');
$$;
CREATE OR REPLACE FUNCTION public.is_authenticator()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.has_capability('authentication.review');
$$;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;

CREATE POLICY "Staff read capability definitions" ON public.role_capabilities FOR SELECT
  TO authenticated USING (public.has_capability('roles.read'));

-- Personal phone/account fields and seller financial totals are not public.
DROP POLICY "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Own profile or customer support read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_capability('customers.read'));
DROP POLICY "Public can view seller profiles" ON public.seller_profiles;
DROP POLICY "Sellers can manage own seller profile" ON public.seller_profiles;
CREATE POLICY "Own or operator seller profile read" ON public.seller_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_capability('sellers.read'));
CREATE POLICY "Sellers create own profile" ON public.seller_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND verification_status = 'PENDING' AND total_sales = 0);
CREATE POLICY "Sellers edit own profile" ON public.seller_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE FUNCTION public.protect_profile_authority_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_capability('users.manage') THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.is_verified_seller IS DISTINCT FROM OLD.is_verified_seller THEN
    RAISE EXCEPTION 'Account authority fields are not self-editable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_protect_authority BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority_fields();

CREATE FUNCTION public.protect_seller_profile_authority_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_capability('users.manage') THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.seller_type IS DISTINCT FROM OLD.seller_type
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.total_sales IS DISTINCT FROM OLD.total_sales THEN
    RAISE EXCEPTION 'Seller verification and sales fields are not self-editable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER seller_profiles_protect_authority BEFORE UPDATE ON public.seller_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_seller_profile_authority_fields();

-- An ADMIN may not elevate themselves to SUPER_ADMIN by direct PostgREST writes.
DROP POLICY "Only admins manage roles" ON public.user_roles;
DROP POLICY "Users can view own roles" ON public.user_roles;
CREATE POLICY "Own roles or role readers" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_capability('roles.read'));

CREATE OR REPLACE FUNCTION public.set_staff_role(
  target_user_id UUID, target_role public.app_role, grant_role BOOLEAN, reason TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed_rows INTEGER;
BEGIN
  IF NOT public.has_capability('roles.manage') THEN
    RAISE EXCEPTION 'Role management requires superadmin permission' USING ERRCODE = '42501';
  END IF;
  IF target_role NOT IN ('SUPER_ADMIN','ADMIN','OPERATIONS','CATALOG_MANAGER',
      'AUTHENTICATOR','FULFILLMENT','FINANCE','SUPPORT','STAFF')
     OR grant_role IS NULL OR length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'Invalid staff role change';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(6391042);
  PERFORM 1 FROM public.profiles WHERE id = target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target account not found'; END IF;
  IF grant_role THEN
    INSERT INTO public.user_roles(user_id,role) VALUES(target_user_id,target_role) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  ELSE
    IF target_role = 'SUPER_ADMIN' AND
       (SELECT count(*) FROM public.user_roles WHERE role = 'SUPER_ADMIN') <= 1 THEN
      RAISE EXCEPTION 'The last superadmin role cannot be removed';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = target_user_id AND role = target_role;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  END IF;
  IF changed_rows > 0 THEN
    INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
      VALUES(auth.uid(),CASE WHEN grant_role THEN 'ROLE_GRANTED' ELSE 'ROLE_REVOKED' END,
        'user',target_user_id,jsonb_build_object('role',target_role,'reason',btrim(reason)));
  END IF;
  RETURN changed_rows > 0;
END; $$;
REVOKE ALL ON FUNCTION public.set_staff_role(UUID,public.app_role,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_role(UUID,public.app_role,BOOLEAN,TEXT) TO authenticated;

-- Replace broad staff writes with read capabilities. Mutations will use audited
-- transition RPCs, never client-side table updates.
DROP POLICY "Staff manage orders" ON public.orders;
DROP POLICY "Users view own orders" ON public.orders;
CREATE POLICY "Order owner or operator read" ON public.orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_capability('orders.read'));
DROP POLICY "Users view own order items" ON public.order_items;
CREATE POLICY "Order owner or operator item read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id
    AND (user_id = auth.uid() OR public.has_capability('orders.read'))));
DROP POLICY "Order owners view timeline" ON public.order_events;
CREATE POLICY "Order owner or operator event read" ON public.order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders WHERE id = order_events.order_id
    AND (user_id = auth.uid() OR public.has_capability('orders.read'))));
DROP POLICY "Users view payments for own orders" ON public.payments;
CREATE POLICY "Payment owner or operator read" ON public.payments FOR SELECT TO authenticated
  USING (public.has_capability('payments.read') OR EXISTS (
    SELECT 1 FROM public.orders WHERE id = payments.order_id AND user_id = auth.uid()));
DROP POLICY "Staff manage payouts" ON public.seller_payouts;
DROP POLICY "Sellers view own payouts" ON public.seller_payouts;
CREATE POLICY "Payout seller or finance read" ON public.seller_payouts FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_capability('payouts.read'));
DROP POLICY "Staff manage commission rules" ON public.commission_rules;
DROP POLICY "Public view active commission rules" ON public.commission_rules;
CREATE POLICY "Public active or finance commission read" ON public.commission_rules FOR SELECT
  USING (active OR public.has_capability('commissions.read'));
DROP POLICY "Admins view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Audit capability read" ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.has_capability('audit.read'));
