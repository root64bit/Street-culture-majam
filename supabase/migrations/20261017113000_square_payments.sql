-- Square settles this UK merchant account in GBP while store orders remain in
-- MZN. Keep one active Square attempt per order and validate the locked FX
-- quote inside the same transaction that confirms inventory.
CREATE OR REPLACE FUNCTION public.create_guest_checkout_order(
    target_order_id UUID,
    target_order_number TEXT,
    target_access_token_hash TEXT,
    target_guest_name TEXT,
    target_guest_email TEXT,
    target_guest_phone TEXT,
    target_shipping_snapshot JSONB,
    target_shipping_method_code TEXT,
    target_items JSONB,
    target_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    created_order_id UUID,
    created_order_number TEXT,
    created_subtotal NUMERIC(12, 2),
    created_shipping NUMERIC(12, 2),
    created_total NUMERIC(12, 2),
    created_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    item RECORD;
    listing_record RECORD;
    shipping_record public.shipping_methods%ROWTYPE;
    commission_record public.commission_rules%ROWTYPE;
    item_commission NUMERIC(12, 2);
    item_seller_net NUMERIC(12, 2);
    rule_id UUID;
    rule_snapshot JSONB;
    order_subtotal NUMERIC(12, 2) := 0;
    order_expires_at TIMESTAMPTZ := NOW() + INTERVAL '15 minutes';
BEGIN
    IF target_access_token_hash IS NULL
        OR target_access_token_hash !~ '^[a-f0-9]{64}$'
        OR target_items IS NULL
        OR jsonb_typeof(target_items) <> 'array'
        OR COALESCE(target_shipping_snapshot->>'country', '') !~ '^[A-Z]{2}$'
        OR COALESCE(target_shipping_snapshot->>'address_line_1', '') = ''
        OR COALESCE(target_shipping_snapshot->>'city', '') = ''
        OR COALESCE(target_shipping_snapshot->>'province', '') = '' THEN
        RAISE EXCEPTION 'Invalid guest checkout request';
    END IF;

    IF jsonb_array_length(target_items) NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Guest checkout needs one to ten items';
    END IF;

    SELECT * INTO shipping_record
    FROM public.shipping_methods AS method
    WHERE method.code = target_shipping_method_code
      AND method.active
      AND method.currency = 'MZN'
      AND method.country_code = target_shipping_snapshot->>'country'
      AND (
          method.region IS NULL
          OR lower(method.region) = lower(target_shipping_snapshot->>'province')
      )
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected shipping method is unavailable';
    END IF;

    INSERT INTO public.orders (
        id, user_id, order_number, status, currency,
        subtotal, shipping_amount, discount_amount, total_amount,
        payment_status, fulfillment_status,
        shipping_address_snapshot, billing_address_snapshot,
        shipping_method_id, shipping_method_snapshot,
        guest_name, guest_email, guest_phone, guest_access_token_hash,
        payment_expires_at
    ) VALUES (
        target_order_id, target_user_id, target_order_number, 'PENDING', 'MZN',
        0, shipping_record.price, 0, shipping_record.price,
        'UNPAID', 'UNFULFILLED',
        target_shipping_snapshot, '{}'::jsonb,
        shipping_record.id,
        jsonb_build_object(
            'code', shipping_record.code, 'name', shipping_record.name,
            'price', shipping_record.price, 'currency', shipping_record.currency,
            'estimated_min_days', shipping_record.estimated_min_days,
            'estimated_max_days', shipping_record.estimated_max_days
        ),
        target_guest_name, lower(target_guest_email), target_guest_phone,
        target_access_token_hash, order_expires_at
    );

    INSERT INTO public.order_events (order_id, event_type)
    VALUES (target_order_id, 'ORDER_CREATED');

    FOR item IN
        SELECT listing_id, size, quantity, expected_price
        FROM jsonb_to_recordset(target_items) AS requested(
            listing_id UUID, size TEXT, quantity INTEGER,
            expected_price NUMERIC(12, 2)
        )
        ORDER BY listing_id
    LOOP
        IF item.listing_id IS NULL OR item.quantity <> 1 THEN
            RAISE EXCEPTION 'Each live listing can only be purchased once';
        END IF;

        SELECT
            l.id, l.product_id, l.variant_id, l.seller_id,
            l.ownership_type, l.condition, l.asking_price,
            p.name AS product_name, p.brand_id, p.category_id,
            b.name AS brand_name, v.size AS variant_size
        INTO listing_record
        FROM public.listings AS l
        JOIN public.products AS p ON p.id = l.product_id AND p.active
        JOIN public.brands AS b ON b.id = p.brand_id AND b.active
        JOIN public.categories AS c ON c.id = p.category_id AND c.active
        JOIN public.product_variants AS v
          ON v.id = l.variant_id AND v.product_id = l.product_id
        WHERE l.id = item.listing_id
          AND l.status = 'LIVE'
          AND l.quantity = 1
          AND l.currency = 'MZN'
          AND l.authentication_status = 'PASSED'
          AND l.asking_price > 0
          AND l.asking_price = trunc(l.asking_price)
        FOR UPDATE OF l;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'A selected item is no longer available';
        END IF;

        IF listing_record.variant_size <> item.size THEN
            RAISE EXCEPTION 'A selected size is no longer available';
        END IF;

        IF item.expected_price IS NULL
            OR listing_record.asking_price <> item.expected_price THEN
            RAISE EXCEPTION 'Selected item price changed';
        END IF;

        item_commission := 0;
        item_seller_net := 0;
        rule_id := NULL;
        rule_snapshot := '{}'::jsonb;

        IF listing_record.ownership_type <> 'STREET_CULTURE' THEN
            SELECT rule.* INTO commission_record
            FROM public.commission_rules AS rule
            WHERE rule.active
              AND rule.currency = 'MZN'
              AND rule.seller_type IN (
                  'STANDARD',
                  COALESCE(
                      (SELECT profile.seller_type
                       FROM public.seller_profiles AS profile
                       WHERE profile.user_id = listing_record.seller_id),
                      'STANDARD'
                  )
              )
              AND (rule.brand_id IS NULL OR rule.brand_id = listing_record.brand_id)
              AND (rule.category_id IS NULL OR rule.category_id = listing_record.category_id)
              AND rule.starts_at <= NOW()
              AND (rule.ends_at IS NULL OR rule.ends_at > NOW())
            ORDER BY
                ((rule.brand_id IS NOT NULL)::INTEGER +
                (rule.category_id IS NOT NULL)::INTEGER) DESC,
                (rule.seller_type <> 'STANDARD') DESC,
                rule.priority DESC, rule.id
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No active MZN commission rule for this listing';
            END IF;

            item_commission := LEAST(
                listing_record.asking_price,
                GREATEST(
                    commission_record.minimum_fee,
                    ROUND(
                        listing_record.asking_price * commission_record.percentage / 100
                        + commission_record.fixed_fee, 2
                    )
                )
            );
            item_seller_net := listing_record.asking_price - item_commission;
            rule_id := commission_record.id;
            rule_snapshot := jsonb_build_object(
                'percentage', commission_record.percentage,
                'fixed_fee', commission_record.fixed_fee,
                'minimum_fee', commission_record.minimum_fee,
                'currency', commission_record.currency,
                'seller_type', commission_record.seller_type
            );
        END IF;

        UPDATE public.listings
        SET status = 'RESERVED', reserved_at = NOW(),
            reservation_expires_at = order_expires_at,
            reserved_by_order_id = target_order_id, updated_at = NOW()
        WHERE id = listing_record.id AND status = 'LIVE';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'A selected item was just reserved by another customer';
        END IF;

        INSERT INTO public.order_items (
            order_id, listing_id, seller_id, product_id, variant_id,
            product_name_snapshot, brand_name_snapshot, size_snapshot,
            condition_snapshot, unit_price, quantity,
            commission_amount, seller_net_amount, commission_rule_id,
            commission_snapshot
        ) VALUES (
            target_order_id, listing_record.id, listing_record.seller_id,
            listing_record.product_id, listing_record.variant_id,
            listing_record.product_name, listing_record.brand_name,
            listing_record.variant_size, listing_record.condition,
            listing_record.asking_price, 1,
            item_commission, item_seller_net, rule_id, rule_snapshot
        );

        INSERT INTO public.order_events (order_id, event_type, metadata)
        VALUES (
            target_order_id, 'LISTING_RESERVED',
            jsonb_build_object('listing_id', listing_record.id)
        );

        order_subtotal := order_subtotal + listing_record.asking_price;
    END LOOP;

    UPDATE public.orders
    SET subtotal = order_subtotal,
        total_amount = order_subtotal + shipping_record.price,
        updated_at = NOW()
    WHERE id = target_order_id;

    RETURN QUERY
    SELECT target_order_id, target_order_number, order_subtotal,
        shipping_record.price, order_subtotal + shipping_record.price,
        order_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_checkout_order(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_guest_checkout_order(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, UUID
) TO service_role;

CREATE UNIQUE INDEX payments_one_active_square_attempt_per_order
ON public.payments (order_id)
WHERE provider = 'square' AND status IN ('PENDING', 'REQUIRES_ACTION');

CREATE FUNCTION public.prevent_mixed_checkout_payments()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.provider NOT IN ('mpesa', 'square') THEN RETURN NEW; END IF;
    PERFORM 1 FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
    IF EXISTS (
        SELECT 1 FROM public.payments
        WHERE order_id = NEW.order_id AND provider <> NEW.provider
          AND status IN ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED')
    ) THEN
        RAISE EXCEPTION 'Another payment method is already active for this order';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER payments_prevent_mixed_checkout
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_mixed_checkout_payments();

CREATE OR REPLACE FUNCTION public.complete_square_checkout_payment(target_payment_id UUID)
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
    amount_minor_text TEXT;
    order_total_text TEXT;
    amount_minor BIGINT;
    quoted_order_total NUMERIC(12, 2);
BEGIN
    SELECT * INTO payment_record
    FROM public.payments
    WHERE id = target_payment_id AND provider = 'square'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Square payment record not found';
    END IF;

    IF payment_record.status = 'SUCCEEDED' THEN
        SELECT * INTO order_record FROM public.orders
        WHERE id = payment_record.order_id;
        RETURN order_record.status = 'CONFIRMED';
    END IF;

    amount_minor_text := COALESCE(payment_record.provider_payload->>'amountMinor', '');
    order_total_text := COALESCE(payment_record.provider_payload->>'orderTotalMzn', '');
    IF amount_minor_text !~ '^[0-9]+$'
        OR order_total_text !~ '^[0-9]+([.][0-9]+)?$' THEN
        RAISE EXCEPTION 'Square payment quote is invalid';
    END IF;
    amount_minor := amount_minor_text::BIGINT;
    quoted_order_total := order_total_text::NUMERIC(12, 2);

    SELECT COUNT(*)::INTEGER INTO expected_count
    FROM public.order_items
    WHERE order_id = payment_record.order_id;

    -- Lock listings before the order, matching the expiry worker lock order.
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

    IF NOT FOUND
        OR payment_record.currency <> 'GBP'
        OR payment_record.amount <= 0
        OR payment_record.amount <> amount_minor::NUMERIC / 100
        OR order_record.currency <> 'MZN'
        OR quoted_order_total <> order_record.total_amount THEN
        RAISE EXCEPTION 'Square payment and locked quote do not match the order';
    END IF;

    IF payment_record.provider_reference IS NULL
        OR payment_record.last_provider_status IS DISTINCT FROM 'COMPLETED'
        OR payment_record.provider_payload->'square'->>'squareStatus' IS DISTINCT FROM 'COMPLETED'
        OR payment_record.provider_payload->'square'->>'currency' IS DISTINCT FROM 'GBP'
        OR (payment_record.provider_payload->'square'->>'amountMinor')::BIGINT IS DISTINCT FROM amount_minor THEN
        RAISE EXCEPTION 'Square has not confirmed the quoted payment amount';
    END IF;

    can_fulfill := can_fulfill
        AND expected_count > 0
        AND locked_count = expected_count
        AND order_record.status = 'PENDING'
        AND order_record.payment_status = 'UNPAID'
        AND order_record.payment_expires_at > NOW();

    UPDATE public.payments
    SET status = 'SUCCEEDED', paid_at = COALESCE(paid_at, NOW()),
        last_provider_status = 'COMPLETED', last_reconciled_at = NOW(),
        reconciliation_needs_review = NOT can_fulfill,
        updated_at = NOW()
    WHERE id = payment_record.id;

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
            'provider', 'square',
            'settlement_amount', payment_record.amount,
            'settlement_currency', payment_record.currency,
            'order_total_mzn', order_record.total_amount
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

REVOKE ALL ON FUNCTION public.complete_square_checkout_payment(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_square_checkout_payment(UUID)
TO service_role;

CREATE OR REPLACE FUNCTION public.fail_square_checkout_payment(target_payment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    payment_record public.payments%ROWTYPE;
    order_record public.orders%ROWTYPE;
BEGIN
    SELECT * INTO payment_record
    FROM public.payments
    WHERE id = target_payment_id AND provider = 'square'
    FOR UPDATE;

    IF NOT FOUND OR payment_record.status = 'SUCCEEDED' THEN
        RETURN FALSE;
    END IF;
    IF payment_record.status = 'FAILED' THEN
        RETURN TRUE;
    END IF;

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

    -- Keep the inventory reservation and order available so the buyer can use
    -- another card or payment method before the original expiry time.
    INSERT INTO public.order_events (order_id, event_type, metadata)
    VALUES (
        order_record.id, 'PAYMENT_FAILED',
        jsonb_build_object('payment_id', payment_record.id, 'provider', 'square')
    );

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_square_checkout_payment(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_square_checkout_payment(UUID)
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

            -- Preserve inventory for partial payments and Square submissions
            -- whose final result still needs reconciliation.
            IF FOUND AND (order_record.payment_status = 'AUTHORIZED' OR EXISTS (
                SELECT 1 FROM public.payments WHERE order_id = order_record.id
                  AND provider = 'square' AND status = 'REQUIRES_ACTION'
            )) THEN
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
                  AND ((provider = 'mpesa' AND status = 'SUCCEEDED')
                    OR (provider = 'square' AND status = 'REQUIRES_ACTION'));
                INSERT INTO public.order_events (order_id, event_type, metadata)
                VALUES (
                    order_record.id, CASE WHEN order_record.payment_status = 'AUTHORIZED'
                        THEN 'PARTIAL_PAYMENT_HOLD_EXTENDED' ELSE 'PAYMENT_REVIEW_HOLD_EXTENDED' END,
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
