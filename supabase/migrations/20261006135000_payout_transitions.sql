ALTER TABLE public.seller_payouts
  ADD COLUMN payment_method TEXT,
  ADD COLUMN payment_reference TEXT;
CREATE UNIQUE INDEX seller_payouts_payment_reference_unique
  ON public.seller_payouts(payment_reference) WHERE payment_reference IS NOT NULL;

CREATE FUNCTION public.protect_payout_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
    OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
    OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
    OR NEW.adjustments IS DISTINCT FROM OLD.adjustments
    OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
    OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'Payout financial snapshot is immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'PAID' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Paid payout cannot be reopened' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payout_protect_snapshot BEFORE UPDATE ON public.seller_payouts
  FOR EACH ROW EXECUTE FUNCTION public.protect_payout_snapshot();

CREATE FUNCTION public.transition_seller_payout(
  target_payout_id UUID, payout_action TEXT, operator_note TEXT,
  payout_method TEXT DEFAULT NULL, payout_reference TEXT DEFAULT NULL
)
RETURNS public.payout_status_enum LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_payout public.seller_payouts%ROWTYPE;
  next_status public.payout_status_enum;
BEGIN
  IF payout_action = 'MARK_PAID' THEN
    IF NOT public.has_capability('payouts.mark_paid') THEN
      RAISE EXCEPTION 'Finance payment permission required' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(coalesce(payout_method,''))) NOT BETWEEN 2 AND 50
      OR length(btrim(coalesce(payout_reference,''))) NOT BETWEEN 6 AND 100 THEN
      RAISE EXCEPTION 'Payment method and external transaction reference required';
    END IF;
  ELSIF NOT public.has_capability('payouts.approve') THEN
    RAISE EXCEPTION 'Payout approval permission required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'An operator note of 10–1000 characters is required';
  END IF;
  SELECT * INTO current_payout FROM public.seller_payouts WHERE id = target_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;
  next_status := CASE
    WHEN payout_action = 'APPROVE' AND current_payout.status = 'PENDING' THEN 'APPROVED'
    WHEN payout_action = 'MARK_PROCESSING' AND current_payout.status = 'APPROVED' THEN 'PROCESSING'
    WHEN payout_action = 'MARK_PAID' AND current_payout.status = 'PROCESSING' THEN 'PAID'
    WHEN payout_action = 'MARK_FAILED' AND current_payout.status IN ('APPROVED','PROCESSING') THEN 'FAILED'
    ELSE NULL END;
  IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid payout transition'; END IF;
  UPDATE public.seller_payouts SET status = next_status,
    processed_at = CASE WHEN next_status = 'PAID' THEN now() ELSE processed_at END,
    payment_method = CASE WHEN next_status = 'PAID' THEN btrim(payout_method) ELSE payment_method END,
    payment_reference = CASE WHEN next_status = 'PAID' THEN btrim(payout_reference) ELSE payment_reference END
  WHERE id = target_payout_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),concat('PAYOUT_',payout_action),'payout',target_payout_id,
    jsonb_build_object('from',current_payout.status,'to',next_status,
      'note',btrim(operator_note),'payment_method',CASE WHEN next_status = 'PAID' THEN btrim(payout_method) END,
      'payment_reference',CASE WHEN next_status = 'PAID' THEN btrim(payout_reference) END));
  RETURN next_status;
END; $$;
REVOKE ALL ON FUNCTION public.transition_seller_payout(UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_seller_payout(UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated;
