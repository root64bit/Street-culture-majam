CREATE OR REPLACE FUNCTION public.protect_seller_consignment_fields()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- The authentication decision RPC is SECURITY DEFINER and has its own
  -- capability check, state machine and audit write. Direct table UPDATE
  -- remains denied to authenticators by RLS.
  IF auth.role() = 'service_role' OR public.has_capability('consignments.review')
    OR public.has_capability('authentication.review') THEN RETURN NEW; END IF;
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
