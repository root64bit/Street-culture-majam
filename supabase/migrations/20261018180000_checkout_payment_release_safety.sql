-- SC-005: a single conservative release decision. Unknown/partial money is held,
-- never refunded or released speculatively. All supported writers serialize on
-- order advisory lock -> payment/listing locks -> order row.
CREATE FUNCTION public.checkout_release_block_reason(target_order_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE
  WHEN o.payment_status IN ('PAID','AUTHORIZED','REFUNDED') THEN 'RECEIVED_OR_REFUNDED_FUNDS'
  WHEN EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=o.id AND
    (p.status='SUCCEEDED' OR p.status='REQUIRES_ACTION' OR
     (p.provider='mpesa' AND p.status='PENDING') OR
     (p.provider_reference IS NOT NULL AND p.status::TEXT NOT IN ('FAILED','REFUNDED')) OR
     (p.reconciliation_needs_review AND p.provider_reference IS NOT NULL))) THEN 'PAYMENT_OUTCOME_UNRESOLVED'
  ELSE NULL END FROM public.orders o WHERE o.id=target_order_id;
$$;
REVOKE ALL ON FUNCTION public.checkout_release_block_reason(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_release_block_reason(UUID) TO service_role;

CREATE TABLE public.checkout_payment_holds (
 order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 reason TEXT NOT NULL,first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 review_due_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '1 hour',
 escalated_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved_at TIMESTAMPTZ
);
ALTER TABLE public.checkout_payment_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance or order operators read holds" ON public.checkout_payment_holds FOR SELECT TO authenticated
 USING(public.has_capability('payments.read') OR public.has_capability('orders.read'));
GRANT SELECT ON public.checkout_payment_holds TO authenticated;
GRANT ALL ON public.checkout_payment_holds TO service_role;

CREATE FUNCTION public.hold_checkout_for_review(target_order_id UUID,hold_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_hold public.checkout_payment_holds%ROWTYPE;
BEGIN
 INSERT INTO public.checkout_payment_holds(order_id,reason) VALUES(target_order_id,hold_reason)
 ON CONFLICT(order_id) DO UPDATE SET reason=excluded.reason,updated_at=now(),resolved_at=NULL
 RETURNING * INTO current_hold;
 UPDATE public.payments SET reconciliation_needs_review=TRUE WHERE order_id=target_order_id
  AND (status IN ('SUCCEEDED','REQUIRES_ACTION') OR (provider='mpesa' AND status='PENDING'));
 UPDATE public.orders SET payment_expires_at=greatest(coalesce(payment_expires_at,now()),now()+interval '15 minutes')
 WHERE id=target_order_id AND status='PENDING';
 UPDATE public.listings SET reservation_expires_at=greatest(coalesce(reservation_expires_at,now()),now()+interval '15 minutes')
 WHERE reserved_by_order_id=target_order_id AND status='RESERVED';
 INSERT INTO public.admin_operational_notifications(event_key,type,title,href,required_capability)
 VALUES('checkout-hold:'||target_order_id,'PAYMENT_HOLD_REVIEW','Unresolved payment: inventory remains protected',
  '/admin/orders/'||target_order_id,'payments.read') ON CONFLICT(event_key) DO NOTHING;
 IF current_hold.review_due_at<=now() THEN
  UPDATE public.checkout_payment_holds SET escalated_at=coalesce(escalated_at,now()) WHERE order_id=target_order_id;
  INSERT INTO public.admin_operational_notifications(event_key,type,title,href,required_capability)
  VALUES('checkout-hold-escalation:'||target_order_id||':'||to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),
   'PAYMENT_HOLD_ESCALATED','Finance escalation: unresolved payment hold exceeds review deadline',
   '/admin/orders/'||target_order_id,'payments.read') ON CONFLICT(event_key) DO NOTHING;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.hold_checkout_for_review(UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.release_checkout_reservation(target_order_id UUID,event_name TEXT,manual_request BOOLEAN)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_order public.orders%ROWTYPE; block_reason TEXT; released INTEGER;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(target_order_id::TEXT,0));
 -- Do not row-lock payment records: no gateway is called until a serialized claim
 -- or insert succeeds; payment claims and completion use the same advisory key.
 block_reason:=public.checkout_release_block_reason(target_order_id);
 IF block_reason IS NOT NULL THEN
  IF manual_request THEN RAISE EXCEPTION 'Payment unresolved or funds received; inventory cannot be released'; END IF;
  PERFORM public.hold_checkout_for_review(target_order_id,block_reason); RETURN 0;
 END IF;
 PERFORM 1 FROM public.listings WHERE reserved_by_order_id=target_order_id ORDER BY id FOR UPDATE;
 SELECT * INTO current_order FROM public.orders WHERE id=target_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 UPDATE public.consignment_submissions SET status='LISTED' WHERE id IN(
  SELECT consignment_submission_id FROM public.listings WHERE reserved_by_order_id=target_order_id AND status='RESERVED');
 UPDATE public.listings SET status='LIVE',reserved_at=NULL,reservation_expires_at=NULL,reserved_by_order_id=NULL
 WHERE reserved_by_order_id=target_order_id AND status='RESERVED';
 GET DIAGNOSTICS released=ROW_COUNT;
 UPDATE public.orders SET status='CANCELLED',payment_status='FAILED' WHERE id=target_order_id AND status='PENDING';
 IF released>0 THEN INSERT INTO public.order_events(order_id,event_type,created_by)
  VALUES(target_order_id,event_name,auth.uid()); END IF;
 UPDATE public.checkout_payment_holds SET resolved_at=now() WHERE order_id=target_order_id AND resolved_at IS NULL;
 RETURN released;
END; $$;
REVOKE ALL ON FUNCTION public.release_checkout_reservation(UUID,TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.release_expired_listing_reservations()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate UUID; total INTEGER:=0;
BEGIN
 FOR candidate IN SELECT DISTINCT reserved_by_order_id FROM public.listings
  WHERE status='RESERVED' AND reservation_expires_at<=now() AND reserved_by_order_id IS NOT NULL ORDER BY reserved_by_order_id
 LOOP
  IF pg_try_advisory_xact_lock(hashtextextended(candidate::TEXT,0)) THEN
   -- A completion/extension may have won while the candidate was enumerated.
   IF EXISTS(SELECT 1 FROM public.listings WHERE reserved_by_order_id=candidate AND status='RESERVED' AND reservation_expires_at<=now()) THEN
    total:=total+public.release_checkout_reservation(candidate,'RESERVATION_EXPIRED',FALSE);
   END IF;
  END IF;
 END LOOP;
 RETURN total;
END; $$;
REVOKE ALL ON FUNCTION public.release_expired_listing_reservations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_listing_reservations() TO service_role;

CREATE FUNCTION public.checkout_payment_insert_gate() RETURNS TRIGGER LANGUAGE plpgsql SET search_path='' AS $$
DECLARE current_order public.orders%ROWTYPE; received NUMERIC;
BEGIN
 IF NEW.provider NOT IN ('square','mpesa') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.order_id::TEXT,0));
 SELECT * INTO current_order FROM public.orders WHERE id=NEW.order_id FOR UPDATE;
 IF NOT FOUND OR current_order.status<>'PENDING' OR current_order.payment_expires_at IS NULL OR current_order.payment_expires_at<=now()
  OR current_order.payment_status NOT IN ('UNPAID','AUTHORIZED','FAILED') THEN
  RAISE EXCEPTION 'Order is not available for a new payment'; END IF;
 IF NEW.provider='mpesa' THEN
  SELECT coalesce(sum(amount),0) INTO received FROM public.payments WHERE order_id=NEW.order_id AND status='SUCCEEDED';
  IF current_order.total_amount<>trunc(current_order.total_amount) OR NEW.amount<>least(75000,current_order.total_amount-received) THEN
   RAISE EXCEPTION 'M-Pesa requires the exact whole-MZN remaining installment'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER payments_00_order_gate BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.checkout_payment_insert_gate();

CREATE FUNCTION public.claim_square_checkout_payment(target_payment_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked_order_id UUID; claimed UUID;
BEGIN
 SELECT p.order_id INTO linked_order_id FROM public.payments p WHERE p.id=target_payment_id AND provider='square';
 IF linked_order_id IS NULL THEN RETURN FALSE; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(linked_order_id::TEXT,0));
 IF NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=linked_order_id AND o.status='PENDING'
  AND o.payment_status='UNPAID' AND o.payment_expires_at>now()) THEN RETURN FALSE; END IF;
 UPDATE public.payments p SET status='REQUIRES_ACTION' WHERE p.id=target_payment_id AND p.status='PENDING' RETURNING p.id INTO claimed;
 RETURN claimed IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.claim_square_checkout_payment(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_square_checkout_payment(UUID) TO service_role;

CREATE FUNCTION public.protect_reserved_inventory_release() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.status='RESERVED' AND NEW.status NOT IN ('RESERVED','SOLD') AND OLD.reserved_by_order_id IS NOT NULL THEN
  -- Also serialize direct privileged table writes. Supported RPCs already own
  -- this lock before touching rows; a conflicting direct write may be aborted
  -- by PostgreSQL's deadlock detector, never allowed to release unsettled stock.
  PERFORM pg_advisory_xact_lock(hashtextextended(OLD.reserved_by_order_id::TEXT,0));
  IF public.checkout_release_block_reason(OLD.reserved_by_order_id) IS NOT NULL THEN
   RAISE EXCEPTION 'Unresolved payment prevents inventory release'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER listings_payment_release_guard BEFORE UPDATE ON public.listings
 FOR EACH ROW EXECUTE FUNCTION public.protect_reserved_inventory_release();

-- Existing completion implementations remain intact behind service-only
-- serialized wrappers. No new refund/compensation mechanism is invented here.
ALTER FUNCTION public.complete_guest_checkout_payment(UUID) RENAME TO complete_guest_checkout_payment_v1;
ALTER FUNCTION public.complete_square_checkout_payment(UUID) RENAME TO complete_square_checkout_payment_v1;
ALTER FUNCTION public.fail_square_checkout_payment(UUID) RENAME TO fail_square_checkout_payment_v1;
ALTER FUNCTION public.record_provider_reconciliation(UUID,UUID,TEXT) RENAME TO record_provider_reconciliation_v1;
REVOKE ALL ON FUNCTION public.complete_guest_checkout_payment_v1(UUID),public.complete_square_checkout_payment_v1(UUID),
 public.fail_square_checkout_payment_v1(UUID),public.record_provider_reconciliation_v1(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.complete_guest_checkout_payment(target_payment_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked_order_id UUID; result BOOLEAN;
BEGIN
 SELECT p.order_id INTO linked_order_id FROM public.payments p WHERE p.id=target_payment_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(linked_order_id::TEXT,0));
 result:=public.complete_guest_checkout_payment_v1(target_payment_id);
 IF result THEN UPDATE public.checkout_payment_holds SET resolved_at=now() WHERE checkout_payment_holds.order_id=linked_order_id; END IF;
 RETURN result;
END; $$;
CREATE FUNCTION public.complete_square_checkout_payment(target_payment_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked_order_id UUID; result BOOLEAN;
BEGIN
 SELECT p.order_id INTO linked_order_id FROM public.payments p WHERE p.id=target_payment_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(linked_order_id::TEXT,0));
 result:=public.complete_square_checkout_payment_v1(target_payment_id);
 IF result THEN UPDATE public.checkout_payment_holds SET resolved_at=now() WHERE checkout_payment_holds.order_id=linked_order_id; END IF;
 RETURN result;
END; $$;
CREATE FUNCTION public.fail_square_checkout_payment(target_payment_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked_order_id UUID; result BOOLEAN;
BEGIN
 SELECT p.order_id INTO linked_order_id FROM public.payments p WHERE p.id=target_payment_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(linked_order_id::TEXT,0));
 result:=public.fail_square_checkout_payment_v1(target_payment_id);
 IF result THEN UPDATE public.payments SET reconciliation_needs_review=FALSE
  WHERE id=target_payment_id AND status='FAILED'; END IF;
 RETURN result;
END; $$;
CREATE FUNCTION public.record_provider_reconciliation(target_payment_id UUID,operator_id UUID,provider_status TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked_order_id UUID;
BEGIN
 SELECT p.order_id INTO linked_order_id FROM public.payments p WHERE p.id=target_payment_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(linked_order_id::TEXT,0));
 RETURN public.record_provider_reconciliation_v1(target_payment_id,operator_id,provider_status);
END; $$;
REVOKE ALL ON FUNCTION public.complete_guest_checkout_payment(UUID),public.complete_square_checkout_payment(UUID),
 public.fail_square_checkout_payment(UUID),public.record_provider_reconciliation(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_guest_checkout_payment(UUID),public.complete_square_checkout_payment(UUID),
 public.fail_square_checkout_payment(UUID),public.record_provider_reconciliation(UUID,UUID,TEXT) TO service_role;


ALTER FUNCTION public.manage_inventory_listing(UUID,TEXT,TEXT,NUMERIC) RENAME TO manage_inventory_listing_nonrelease;
ALTER FUNCTION public.operate_order(UUID,TEXT,TEXT) RENAME TO operate_order_nonrelease;
REVOKE ALL ON FUNCTION public.manage_inventory_listing_nonrelease(UUID,TEXT,TEXT,NUMERIC), public.operate_order_nonrelease(UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.manage_inventory_listing(target_listing_id UUID,inventory_action TEXT,operator_note TEXT,new_price NUMERIC DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked_order_id UUID; released INTEGER;
BEGIN
 IF inventory_action<>'RELEASE_EXPIRED' THEN RETURN public.manage_inventory_listing_nonrelease(target_listing_id,inventory_action,operator_note,new_price); END IF;
 IF NOT public.has_capability('inventory.manage') THEN RAISE EXCEPTION 'Inventory permission required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Operator reason required'; END IF;
 SELECT reserved_by_order_id INTO linked_order_id FROM public.listings WHERE id=target_listing_id;
 IF linked_order_id IS NULL THEN RAISE EXCEPTION 'No linked reservation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(linked_order_id::TEXT,0));
 IF NOT EXISTS(SELECT 1 FROM public.listings WHERE id=target_listing_id AND status='RESERVED' AND reservation_expires_at<=now()) THEN RAISE EXCEPTION 'Reservation is not expired'; END IF;
 released:=public.release_checkout_reservation(linked_order_id,'RESERVATION_EXPIRED',TRUE);
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),'INVENTORY_RELEASE_EXPIRED','listing',target_listing_id,jsonb_build_object('order_id',linked_order_id,'reason',operator_note,'released',released));
 RETURN target_listing_id;
END; $$;
CREATE FUNCTION public.operate_order(target_order_id UUID,order_action TEXT,operator_note TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF order_action<>'CANCEL' THEN RETURN public.operate_order_nonrelease(target_order_id,order_action,operator_note); END IF;
 IF NOT public.has_capability('orders.update') THEN RAISE EXCEPTION 'Order update permission required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(operator_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Operator reason required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target_order_id::TEXT,0));
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=target_order_id AND status='PENDING') THEN RAISE EXCEPTION 'Invalid order cancellation'; END IF;
 PERFORM public.release_checkout_reservation(target_order_id,'ORDER_CANCELLED',TRUE);
 INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),'ORDER_CANCEL','order',target_order_id,jsonb_build_object('reason',operator_note));
 RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.manage_inventory_listing(UUID,TEXT,TEXT,NUMERIC),public.operate_order(UUID,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_inventory_listing(UUID,TEXT,TEXT,NUMERIC),public.operate_order(UUID,TEXT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fail_guest_checkout_payment(target_payment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    payment_record public.payments%ROWTYPE;
    order_record public.orders%ROWTYPE;
    confirmed_total NUMERIC(12, 2);
    hold_until TIMESTAMPTZ;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended((SELECT order_id::TEXT FROM public.payments WHERE id=target_payment_id),0));
    SELECT * INTO payment_record
    FROM public.payments
    WHERE id = target_payment_id AND provider = 'mpesa'
    FOR UPDATE;

    IF NOT FOUND OR payment_record.status = 'SUCCEEDED' THEN
        RETURN FALSE;
    END IF;
    IF payment_record.status = 'FAILED' THEN
        RETURN TRUE;
    END IF;

    PERFORM 1 FROM public.listings
    WHERE reserved_by_order_id = payment_record.order_id
    ORDER BY id FOR UPDATE;

    SELECT * INTO order_record
    FROM public.orders
    WHERE id = payment_record.order_id
    FOR UPDATE;

    IF NOT FOUND OR order_record.payment_status = 'PAID' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.payments
    SET status = 'FAILED', failed_at = NOW(), reconciliation_needs_review=FALSE, last_provider_status='FAILED', updated_at = NOW()
    WHERE id = payment_record.id;

    SELECT COALESCE(SUM(amount), 0) INTO confirmed_total
    FROM public.payments
    WHERE order_id = order_record.id
      AND provider = 'mpesa'
      AND status = 'SUCCEEDED';

    IF confirmed_total > 0 THEN
        hold_until := GREATEST(
            COALESCE(order_record.payment_expires_at, NOW()),
            NOW() + INTERVAL '30 minutes'
        );
        UPDATE public.orders
        SET payment_status = 'AUTHORIZED', payment_expires_at = hold_until,
            updated_at = NOW()
        WHERE id = order_record.id AND status = 'PENDING';
        UPDATE public.listings
        SET reservation_expires_at = hold_until, updated_at = NOW()
        WHERE reserved_by_order_id = order_record.id AND status = 'RESERVED';
    ELSE
        PERFORM public.release_checkout_reservation(order_record.id,'PAYMENT_FAILED',FALSE);
    END IF;

    INSERT INTO public.order_events (order_id, event_type, metadata)
    VALUES (
        order_record.id,
        CASE WHEN confirmed_total > 0 THEN 'PAYMENT_INSTALLMENT_FAILED' ELSE 'PAYMENT_FAILED' END,
        jsonb_build_object(
            'payment_id', payment_record.id,
            'confirmed_total', confirmed_total,
            'remaining_amount', order_record.total_amount - confirmed_total
        )
    );

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_guest_checkout_payment(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_guest_checkout_payment(UUID)
TO service_role;


