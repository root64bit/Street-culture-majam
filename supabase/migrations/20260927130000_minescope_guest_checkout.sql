-- Guest checkout backed by inventory-owned orders and the MineScope M-Pesa proxy.
ALTER TABLE public.orders
    ALTER COLUMN user_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS guest_name TEXT,
    ADD COLUMN IF NOT EXISTS guest_email TEXT,
    ADD COLUMN IF NOT EXISTS guest_phone TEXT,
    ADD COLUMN IF NOT EXISTS guest_access_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_guest_or_account_owner_check
    CHECK (
        user_id IS NOT NULL
        OR (
            guest_name IS NOT NULL
            AND guest_email IS NOT NULL
            AND guest_phone IS NOT NULL
            AND guest_access_token_hash IS NOT NULL
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS orders_guest_access_token_hash_unique
    ON public.orders (guest_access_token_hash)
    WHERE guest_access_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_open_mpesa_per_order
    ON public.payments (order_id)
    WHERE provider = 'mpesa' AND status IN ('PENDING', 'REQUIRES_ACTION');

CREATE TABLE IF NOT EXISTS public.guest_checkout_rate_limits (
    key_hash TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.guest_checkout_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_checkout_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_guest_checkout_rate_limit(
    target_key_hash TEXT,
    target_max_attempts INTEGER,
    target_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_attempts INTEGER;
BEGIN
    IF target_key_hash !~ '^[a-f0-9]{64}$'
        OR target_max_attempts NOT BETWEEN 1 AND 200
        OR target_window_seconds NOT BETWEEN 60 AND 3600 THEN
        RAISE EXCEPTION 'Invalid checkout rate limit parameters';
    END IF;

    INSERT INTO public.guest_checkout_rate_limits (key_hash, window_started_at, attempt_count)
    VALUES (target_key_hash, NOW(), 1)
    ON CONFLICT (key_hash) DO UPDATE
    SET window_started_at = CASE
            WHEN public.guest_checkout_rate_limits.window_started_at
                    + make_interval(secs => target_window_seconds) <= NOW()
                THEN NOW()
            ELSE public.guest_checkout_rate_limits.window_started_at
        END,
        attempt_count = CASE
            WHEN public.guest_checkout_rate_limits.window_started_at
                    + make_interval(secs => target_window_seconds) <= NOW()
                THEN 1
            ELSE public.guest_checkout_rate_limits.attempt_count + 1
        END,
        updated_at = NOW()
    RETURNING attempt_count INTO current_attempts;

    RETURN current_attempts <= target_max_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_guest_checkout_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_checkout_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.create_guest_checkout_order(
    target_order_id UUID,
    target_order_number TEXT,
    target_access_token_hash TEXT,
    target_guest_name TEXT,
    target_guest_email TEXT,
    target_guest_phone TEXT,
    target_shipping_snapshot JSONB,
    target_items JSONB
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
    order_subtotal NUMERIC(12, 2) := 0;
    shipping_amount NUMERIC(12, 2) := 350;
    order_expires_at TIMESTAMPTZ := NOW() + INTERVAL '30 minutes';
BEGIN
    IF target_access_token_hash !~ '^[a-f0-9]{64}$'
        OR jsonb_typeof(target_items) <> 'array'
        OR jsonb_array_length(target_items) NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Invalid guest checkout request';
    END IF;

    INSERT INTO public.orders (
        id, user_id, order_number, status, currency,
        subtotal, shipping_amount, discount_amount, total_amount,
        payment_status, fulfillment_status,
        shipping_address_snapshot, billing_address_snapshot,
        guest_name, guest_email, guest_phone, guest_access_token_hash,
        payment_expires_at
    ) VALUES (
        target_order_id, NULL, target_order_number, 'PENDING', 'MZN',
        0, shipping_amount, 0, shipping_amount,
        'UNPAID', 'UNFULFILLED',
        target_shipping_snapshot, '{}'::jsonb,
        target_guest_name, lower(target_guest_email), target_guest_phone,
        target_access_token_hash, order_expires_at
    );

    FOR item IN
        SELECT listing_id, size, quantity
        FROM jsonb_to_recordset(target_items) AS requested(listing_id UUID, size TEXT, quantity INTEGER)
    LOOP
        IF item.quantity <> 1 THEN
            RAISE EXCEPTION 'Each live listing can only be purchased once';
        END IF;

        SELECT
            l.id,
            l.product_id,
            l.variant_id,
            l.seller_id,
            l.condition,
            l.asking_price,
            l.currency,
            l.quantity,
            p.name AS product_name,
            b.name AS brand_name,
            v.size AS variant_size
        INTO listing_record
        FROM public.listings AS l
        JOIN public.products AS p ON p.id = l.product_id AND p.active = TRUE
        JOIN public.brands AS b ON b.id = p.brand_id AND b.active = TRUE
        JOIN public.product_variants AS v ON v.id = l.variant_id
        WHERE l.id = item.listing_id
          AND l.status = 'LIVE'
          AND l.quantity = 1
          AND l.currency = 'MZN'
          AND l.asking_price = trunc(l.asking_price)
        FOR UPDATE OF l;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'A selected item is no longer available';
        END IF;

        IF listing_record.variant_size <> item.size THEN
            RAISE EXCEPTION 'A selected size is no longer available';
        END IF;

        UPDATE public.listings
        SET status = 'RESERVED',
            reserved_at = NOW(),
            reservation_expires_at = order_expires_at,
            updated_at = NOW()
        WHERE id = listing_record.id AND status = 'LIVE';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'A selected item was just reserved by another customer';
        END IF;

        INSERT INTO public.order_items (
            order_id, listing_id, seller_id, product_id, variant_id,
            product_name_snapshot, brand_name_snapshot, size_snapshot,
            condition_snapshot, unit_price, quantity
        ) VALUES (
            target_order_id, listing_record.id, listing_record.seller_id,
            listing_record.product_id, listing_record.variant_id,
            listing_record.product_name, listing_record.brand_name,
            listing_record.variant_size, listing_record.condition,
            listing_record.asking_price, 1
        );

        order_subtotal := order_subtotal + listing_record.asking_price;
    END LOOP;

    UPDATE public.orders
    SET subtotal = order_subtotal,
        total_amount = order_subtotal + shipping_amount,
        updated_at = NOW()
    WHERE id = target_order_id;

    RETURN QUERY
    SELECT target_order_id, target_order_number, order_subtotal,
        shipping_amount, order_subtotal + shipping_amount, order_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_checkout_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_guest_checkout_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO service_role;

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
    expected_item_count INTEGER;
    locked_item_count INTEGER := 0;
    inventory_fulfillable BOOLEAN := TRUE;
    can_fulfill BOOLEAN := FALSE;
BEGIN
    SELECT * INTO payment_record
    FROM public.payments
    WHERE id = target_payment_id AND provider = 'mpesa'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'M-Pesa payment record not found';
    END IF;

    IF payment_record.status = 'SUCCEEDED' THEN
        SELECT * INTO order_record
        FROM public.orders
        WHERE id = payment_record.order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Order for M-Pesa payment not found';
        END IF;
        RETURN order_record.status = 'CONFIRMED';
    END IF;

    -- Lock inventory before the order row, matching the expiry worker's lock
    -- order. This prevents a reservation being released between validation
    -- and the sale transition, and avoids confirming incomplete orders.
    SELECT COUNT(*)::INTEGER INTO expected_item_count
    FROM public.order_items AS item
    WHERE item.order_id = payment_record.order_id;

    FOR inventory_record IN
        SELECT listing.id, listing.status, listing.reservation_expires_at
        FROM public.order_items AS item
        JOIN public.listings AS listing ON listing.id = item.listing_id
        WHERE item.order_id = payment_record.order_id
        ORDER BY listing.id
        FOR UPDATE OF listing
    LOOP
        locked_item_count := locked_item_count + 1;
        IF inventory_record.status <> 'RESERVED'
            OR inventory_record.reservation_expires_at IS NULL
            OR inventory_record.reservation_expires_at <= NOW() THEN
            inventory_fulfillable := FALSE;
        END IF;
    END LOOP;

    SELECT * INTO order_record
    FROM public.orders
    WHERE id = payment_record.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order for M-Pesa payment not found';
    END IF;

    can_fulfill := expected_item_count > 0
        AND locked_item_count = expected_item_count
        AND inventory_fulfillable
        AND order_record.status = 'PENDING'
        AND order_record.payment_expires_at > NOW();

    UPDATE public.payments
    SET status = 'SUCCEEDED', paid_at = NOW(), updated_at = NOW()
    WHERE id = payment_record.id;

    UPDATE public.orders
    SET payment_status = 'PAID',
        status = CASE WHEN can_fulfill THEN 'CONFIRMED'::order_status_enum
            WHEN status = 'PENDING' THEN 'CANCELLED'::order_status_enum
            ELSE status END,
        updated_at = NOW()
    WHERE id = order_record.id;

    IF can_fulfill THEN
        UPDATE public.listings AS listing
        SET status = 'SOLD', sold_at = NOW(), reserved_at = NULL,
            reservation_expires_at = NULL, updated_at = NOW()
        WHERE listing.id IN (
            SELECT item.listing_id
            FROM public.order_items AS item
            WHERE item.order_id = order_record.id
        ) AND listing.status = 'RESERVED';
    END IF;

    RETURN COALESCE(can_fulfill, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_guest_checkout_payment(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_guest_checkout_payment(UUID) TO service_role;
