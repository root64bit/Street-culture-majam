CREATE FUNCTION public.flag_payment_review(target_payment_id UUID,needs_review BOOLEAN,operator_note TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment_row public.payments%ROWTYPE;order_row public.orders%ROWTYPE;
BEGIN
  IF NOT public.has_capability('payments.reconcile') THEN RAISE EXCEPTION 'Reconciliation permission required' USING ERRCODE='42501'; END IF;
  IF needs_review IS NULL OR length(btrim(coalesce(operator_note,''))) NOT BETWEEN 20 AND 2000 THEN RAISE EXCEPTION 'Provide a review note of 20–2000 characters'; END IF;
  SELECT * INTO payment_row FROM public.payments WHERE id=target_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  SELECT * INTO order_row FROM public.orders WHERE id=payment_row.order_id FOR UPDATE;
  IF NOT needs_review AND NOT ((payment_row.status='SUCCEEDED' AND payment_row.last_provider_status='PAID' AND order_row.payment_status='PAID' AND order_row.status NOT IN ('CANCELLED','REFUNDED'))
    OR (payment_row.status='FAILED' AND payment_row.last_provider_status='FAILED' AND order_row.payment_status<>'PAID')) THEN RAISE EXCEPTION 'Only a verified matching provider/local state can clear review'; END IF;
  UPDATE public.payments SET reconciliation_needs_review=needs_review WHERE id=target_payment_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),CASE WHEN needs_review THEN 'PAYMENT_FLAGGED_FOR_REVIEW' ELSE 'PAYMENT_REVIEW_CLEARED' END,'payment',target_payment_id,jsonb_build_object('note',btrim(operator_note),'order_id',order_row.id));
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.flag_payment_review(UUID,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_payment_review(UUID,BOOLEAN,TEXT) TO authenticated;
