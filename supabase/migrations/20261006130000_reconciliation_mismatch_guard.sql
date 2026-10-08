CREATE OR REPLACE FUNCTION public.record_provider_reconciliation(
  target_payment_id UUID, operator_id UUID, provider_status TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  payment_record public.payments%ROWTYPE;
  changed BOOLEAN := FALSE;
  needs_review BOOLEAN := FALSE;
  can_fulfill BOOLEAN;
  failure_recorded BOOLEAN;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF provider_status NOT IN ('PAID','FAILED','CANCELLED','PROCESSING','PENDING') THEN
    RAISE EXCEPTION 'Invalid provider status';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    JOIN public.user_roles membership ON membership.user_id = profile.id
    JOIN public.role_capabilities permission ON permission.role = membership.role
    WHERE profile.id = operator_id AND profile.account_status = 'ACTIVE'
      AND permission.capability = 'payments.reconcile'
  ) THEN
    RAISE EXCEPTION 'Reconciliation permission required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO payment_record FROM public.payments
  WHERE id = target_payment_id AND provider = 'mpesa' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'M-Pesa payment not found'; END IF;

  IF provider_status = 'PAID' THEN
    can_fulfill := public.complete_guest_checkout_payment(target_payment_id);
    changed := payment_record.status <> 'SUCCEEDED';
    needs_review := NOT can_fulfill;
  ELSIF provider_status IN ('FAILED','CANCELLED') THEN
    failure_recorded := public.fail_guest_checkout_payment(target_payment_id);
    changed := failure_recorded AND payment_record.status <> 'FAILED';
    needs_review := payment_record.status = 'SUCCEEDED';
  ELSIF payment_record.status IN ('SUCCEEDED','FAILED') THEN
    needs_review := TRUE;
  END IF;

  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(operator_id,'PAYMENT_RECONCILED','payment',target_payment_id,
    jsonb_build_object('provider_status',provider_status,'local_status_before',payment_record.status,
      'changed',changed,'needs_review',needs_review,'order_id',payment_record.order_id));
  RETURN jsonb_build_object('status',provider_status,'changed',changed,
    'needsReview',needs_review);
END; $$;
