-- STAFF can inspect operations but cannot bypass reviewed publication by making
-- a direct PostgREST listing update. Admin publication uses SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Sellers edit drafts; staff manage listings" ON public.listings;
CREATE POLICY "Sellers edit own draft listings" ON public.listings FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() AND ownership_type <> 'STREET_CULTURE' AND status = 'DRAFT')
  WITH CHECK (seller_id = auth.uid() AND ownership_type <> 'STREET_CULTURE'
    AND status = 'DRAFT' AND authentication_status = 'PENDING'
    AND reserved_at IS NULL AND sold_at IS NULL);

DROP POLICY IF EXISTS "Authenticators manage records" ON public.authentication_records;
CREATE POLICY "Authenticators and admins manage records" ON public.authentication_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'AUTHENTICATOR') OR public.is_admin())
  WITH CHECK (public.has_role(auth.uid(), 'AUTHENTICATOR') OR public.is_admin());
