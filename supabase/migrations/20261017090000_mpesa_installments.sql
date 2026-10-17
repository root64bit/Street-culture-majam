-- M-Pesa accepts at most 75,000 MZN in one C2B transaction. Larger orders
-- are settled with sequential, independently confirmed payment records. A
-- column-scoped trigger protects new amounts without blocking status-only
-- reconciliation updates to any legacy record above the limit.
CREATE OR REPLACE FUNCTION public.enforce_mpesa_transaction_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.provider = 'mpesa'
    AND (NEW.amount <= 0 OR NEW.amount > 75000 OR NEW.amount <> trunc(NEW.amount)) THEN
    RAISE EXCEPTION 'M-Pesa payments must be whole-MZN amounts from 1 to 75000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_enforce_mpesa_transaction_limit
BEFORE INSERT OR UPDATE OF provider, amount ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_mpesa_transaction_limit();

CREATE OR REPLACE FUNCTION public.complete_guest_checkout_payment(target_payment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    payment_record public.payments%ROWTYPE;
    order_record public.orders%ROWTYPE;
    inventory_record RECORD;
    expected_count INTEGER;
    locked_count INTEGER := 0;
    sold_count INTEGER;
    can_fulfill BOOLEAN := TRUE;
    confirmed_total NUMERIC(12, 2);
    hold_until TIMESTAMPTZ;
BEGIN
    SELECT * INTO payment_record
    FROM public.payments
    WHERE id = target_payment_id AND provider = 'mpesa'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'M-Pesa payment record not found';
    END IF;

    IF payment_record.status = 'SUCCEEDED' THEN
        SELECT * INTO order_record FROM public.orders
        WHERE id = payment_record.order_id;
        RETURN order_record.status = 'CONFIRMED';
    END IF;

    SELECT COUNT(*)::INTEGER INTO expected_count
    FROM public.order_items
    WHERE order_id = payment_record.order_id;

    -- Match the expiry worker lock order so inventory cannot be released while
    -- an installment is being recorded.
    FOR inventory_record IN
        SELECT l.id, l.status, l.reservation_expires_at,
            l.reserved_by_order_id
        FROM public.order_items AS item
        JOIN public.listings AS l ON l.id = item.listing_id
        WHERE item.order_id = payment_record.order_id
        ORDER BY l.id
        FOR UPDATE OF l
    LOOP
        locked_count := locked_count + 1;
        IF inventory_record.status <> 'RESERVED'
            OR inventory_record.reserved_by_order_id IS DISTINCT FROM payment_record.order_id
            OR inventory_record.reservation_expires_at IS NULL
            OR inventory_record.reservation_expires_at <= NOW() THEN
            can_fulfill := FALSE;
        END IF;
    END LOOP;

    SELECT * INTO order_record
    FROM public.orders
    WHERE id = payment_record.order_id
    FOR UPDATE;

    IF NOT FOUND OR payment_record.currency <> 'MZN'
        OR payment_record.amount <= 0
        OR payment_record.amount > 75000
        OR payment_record.amount <> trunc(payment_record.amount)
        OR order_record.currency <> 'MZN' THEN
        RAISE EXCEPTION 'Invalid M-Pesa installment';
    END IF;

    UPDATE public.payments
    SET status = 'SUCCEEDED', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
    WHERE id = payment_record.id;

    SELECT COALESCE(SUM(amount), 0) INTO confirmed_total
    FROM public.payments
    WHERE order_id = order_record.id
      AND provider = 'mpesa'
      AND status = 'SUCCEEDED';

    IF confirmed_total > order_record.total_amount THEN
        RAISE EXCEPTION 'Confirmed M-Pesa installments exceed the order total';
    END IF;

    IF confirmed_total < order_record.total_amount THEN
        IF order_record.status <> 'PENDING'
            OR order_record.payment_status NOT IN ('UNPAID', 'AUTHORIZED') THEN
            RAISE EXCEPTION 'Order is not eligible for another M-Pesa installment';
        END IF;

        hold_until := GREATEST(
            COALESCE(order_record.payment_expires_at, NOW()),
            NOW() + INTERVAL '30 minutes'
        );
        UPDATE public.orders
        SET payment_status = 'AUTHORIZED', payment_expires_at = hold_until,
            updated_at = NOW()
        WHERE id = order_record.id;
        UPDATE public.listings
        SET reservation_expires_at = hold_until, updated_at = NOW()
        WHERE reserved_by_order_id = order_record.id AND status = 'RESERVED';
        INSERT INTO public.order_events (order_id, event_type, metadata)
        VALUES (
            order_record.id, 'PAYMENT_INSTALLMENT_CONFIRMED',
            jsonb_build_object(
                'payment_id', payment_record.id,
                'installment_amount', payment_record.amount,
                'confirmed_total', confirmed_total,
                'remaining_amount', order_record.total_amount - confirmed_total
            )
        );
        RETURN FALSE;
    END IF;

    can_fulfill := can_fulfill
        AND expected_count > 0
        AND locked_count = expected_count
        AND order_record.status = 'PENDING'
        AND order_record.payment_status IN ('UNPAID', 'AUTHORIZED')
        AND order_record.payment_expires_at > NOW();

    UPDATE public.orders
    SET payment_status = 'PAID',
        status = CASE WHEN can_fulfill THEN 'CONFIRMED'::order_status_enum
            WHEN status = 'PENDING' THEN 'CANCELLED'::order_status_enum
            ELSE status END,
        updated_at = NOW()
    WHERE id = order_record.id;

    INSERT INTO public.order_events (order_id, event_type, metadata)
    VALUES (
        order_record.id, 'PAYMENT_CONFIRMED',
        jsonb_build_object(
            'payment_id', payment_record.id,
            'confirmed_total', confirmed_total,
            'installment_count', (
                SELECT COUNT(*) FROM public.payments
                WHERE order_id = order_record.id
                  AND provider = 'mpesa'
                  AND status = 'SUCCEEDED'
            )
        )
    );

    IF can_fulfill THEN
        UPDATE public.listings AS listing
        SET status = 'SOLD', sold_at = NOW(), reserved_at = NULL,
            reservation_expires_at = NULL, reserved_by_order_id = NULL,
            updated_at = NOW()
        WHERE listing.reserved_by_order_id = order_record.id
          AND listing.status = 'RESERVED';

        GET DIAGNOSTICS sold_count = ROW_COUNT;
        IF sold_count <> expected_count THEN
            RAISE EXCEPTION 'Reserved inventory changed during payment completion';
        END IF;

        INSERT INTO public.order_events (order_id, event_type, metadata)
        SELECT order_record.id, 'LISTING_SOLD',
            jsonb_build_object('listing_id', item.listing_id)
        FROM public.order_items AS item
        WHERE item.order_id = order_record.id;

        INSERT INTO public.seller_payouts (
            seller_id, order_item_id, listing_id, gross_amount,
            commission_amount, adjustments, net_amount, currency, status
        )
        SELECT item.seller_id, item.id, item.listing_id,
            item.unit_price * item.quantity, item.commission_amount,
            0, item.seller_net_amount, order_record.currency, 'PENDING'
        FROM public.order_items AS item
        JOIN public.listings AS listing ON listing.id = item.listing_id
        WHERE item.order_id = order_record.id
          AND listing.ownership_type <> 'STREET_CULTURE'
        ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

        INSERT INTO public.order_events (order_id, event_type, metadata)
        SELECT order_record.id, 'PAYOUT_CREATED',
            jsonb_build_object('order_item_id', item.id)
        FROM public.order_items AS item
        JOIN public.listings AS listing ON listing.id = item.listing_id
        WHERE item.order_id = order_record.id
          AND listing.ownership_type <> 'STREET_CULTURE';

        UPDATE public.consignment_submissions AS submission
        SET status = 'SOLD', updated_at = NOW()
        WHERE submission.id IN (
            SELECT listing.consignment_submission_id
            FROM public.order_items AS item
            JOIN public.listings AS listing ON listing.id = item.listing_id
            WHERE item.order_id = order_record.id
              AND listing.ownership_type = 'CONSIGNMENT'
        ) AND submission.status NOT IN ('PAID', 'SOLD');

        INSERT INTO public.order_events (order_id, event_type)
        VALUES (order_record.id, 'ORDER_CONFIRMED');
    ELSE
        INSERT INTO public.order_events (order_id, event_type)
        VALUES (order_record.id, 'PAID_ORDER_REQUIRES_REVIEW');
    END IF;

    RETURN can_fulfill;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_guest_checkout_payment(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_guest_checkout_payment(UUID)
TO service_role;

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
    SET status = 'FAILED', failed_at = NOW(), updated_at = NOW()
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
        UPDATE public.orders
        SET status = 'CANCELLED', payment_status = 'FAILED', updated_at = NOW()
        WHERE id = order_record.id AND status = 'PENDING';
        UPDATE public.listings
        SET status = 'LIVE', reserved_at = NULL,
            reservation_expires_at = NULL, reserved_by_order_id = NULL,
            updated_at = NOW()
        WHERE reserved_by_order_id = order_record.id AND status = 'RESERVED';
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

CREATE OR REPLACE FUNCTION public.release_expired_listing_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    listing_record public.listings%ROWTYPE;
    order_record public.orders%ROWTYPE;
    released_count INTEGER := 0;
    protected_until TIMESTAMPTZ;
BEGIN
    FOR listing_record IN
        SELECT * FROM public.listings
        WHERE status = 'RESERVED'
          AND reservation_expires_at <= NOW()
        ORDER BY id FOR UPDATE SKIP LOCKED
    LOOP
        IF listing_record.reserved_by_order_id IS NOT NULL THEN
            SELECT * INTO order_record
            FROM public.orders
            WHERE id = listing_record.reserved_by_order_id
            FOR UPDATE;

            IF FOUND AND order_record.payment_status = 'PAID' THEN
                CONTINUE;
            END IF;

            -- Once any installment has been received, inventory cannot safely
            -- be resold. Keep the hold and flag it for an operator instead.
            IF FOUND AND order_record.payment_status = 'AUTHORIZED' THEN
                protected_until := NOW() + INTERVAL '24 hours';
                UPDATE public.orders
                SET payment_expires_at = protected_until, updated_at = NOW()
                WHERE id = order_record.id;
                UPDATE public.listings
                SET reservation_expires_at = protected_until, updated_at = NOW()
                WHERE reserved_by_order_id = order_record.id AND status = 'RESERVED';
                UPDATE public.payments
                SET reconciliation_needs_review = TRUE
                WHERE order_id = order_record.id
                  AND provider = 'mpesa'
                  AND status = 'SUCCEEDED';
                INSERT INTO public.order_events (order_id, event_type, metadata)
                VALUES (
                    order_record.id, 'PARTIAL_PAYMENT_HOLD_EXTENDED',
                    jsonb_build_object('extended_until', protected_until)
                );
                CONTINUE;
            END IF;

            IF FOUND AND order_record.status = 'PENDING' THEN
                UPDATE public.orders
                SET status = 'CANCELLED', payment_status = 'FAILED',
                    updated_at = NOW()
                WHERE id = order_record.id;
                INSERT INTO public.order_events (order_id, event_type)
                VALUES (order_record.id, 'RESERVATION_EXPIRED');
            END IF;
        END IF;

        UPDATE public.listings
        SET status = 'LIVE', reserved_at = NULL,
            reservation_expires_at = NULL, reserved_by_order_id = NULL,
            updated_at = NOW()
        WHERE id = listing_record.id AND status = 'RESERVED';

        IF FOUND THEN
            released_count := released_count + 1;
        END IF;
    END LOOP;

    RETURN released_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_listing_reservations()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_listing_reservations()
TO service_role;

CREATE OR REPLACE FUNCTION public.record_provider_reconciliation(
  target_payment_id UUID, operator_id UUID, provider_status TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  payment_record public.payments%ROWTYPE;
  order_total NUMERIC(12, 2);
  confirmed_total NUMERIC(12, 2);
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
  IF operator_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    JOIN public.user_roles membership ON membership.user_id = profile.id
    JOIN public.role_capabilities permission ON permission.role = membership.role
    WHERE profile.id = operator_id AND profile.account_status = 'ACTIVE' AND NOT profile.admin_access_disabled
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
    SELECT total_amount INTO order_total FROM public.orders WHERE id = payment_record.order_id;
    SELECT COALESCE(SUM(amount), 0) INTO confirmed_total FROM public.payments
      WHERE order_id = payment_record.order_id AND provider = 'mpesa' AND status = 'SUCCEEDED';
    needs_review := confirmed_total >= order_total AND NOT can_fulfill;
  ELSIF provider_status IN ('FAILED','CANCELLED') THEN
    failure_recorded := public.fail_guest_checkout_payment(target_payment_id);
    changed := failure_recorded AND payment_record.status <> 'FAILED';
    needs_review := payment_record.status = 'SUCCEEDED';
  ELSIF payment_record.status IN ('SUCCEEDED','FAILED') THEN
    needs_review := TRUE;
  END IF;

  UPDATE public.payments SET last_reconciled_at=NOW(),last_provider_status=provider_status,
    reconciliation_needs_review=needs_review WHERE id=target_payment_id;
  INSERT INTO public.admin_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(operator_id,'PAYMENT_RECONCILED','payment',target_payment_id,
    jsonb_build_object('provider_status',provider_status,'local_status_before',payment_record.status,
      'changed',changed,'needs_review',needs_review,'order_id',payment_record.order_id,
      'confirmed_total',confirmed_total,
      'source',CASE WHEN operator_id IS NULL THEN 'scheduled' ELSE 'operator' END));
  RETURN jsonb_build_object('status',provider_status,'changed',changed,
    'needsReview',needs_review,'confirmedTotal',confirmed_total);
END; $$;
