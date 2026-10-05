-- The order owns a one-of-one reservation. Public callers must not be able to
-- reserve inventory without creating an order through the service-role RPC.
DROP FUNCTION IF EXISTS public.reserve_listing(UUID, UUID);

ALTER TABLE public.listings
    ALTER COLUMN seller_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS reserved_by_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.listings
    ADD CONSTRAINT listings_external_seller_required
    CHECK (ownership_type = 'STREET_CULTURE' OR seller_id IS NOT NULL);

-- The original seller policy permitted arbitrary status/authentication edits.
-- Sellers may prepare drafts only; staff or service-role workflows publish.
DROP POLICY IF EXISTS "Public read live listings" ON public.listings;
CREATE POLICY "Public read sellable listings"
ON public.listings FOR SELECT
USING (
    (status = 'LIVE' AND authentication_status = 'PASSED' AND quantity = 1 AND currency = 'MZN')
    OR seller_id = auth.uid()
    OR public.is_staff()
);

DROP POLICY IF EXISTS "Sellers can create listings" ON public.listings;
CREATE POLICY "Sellers create draft listings"
ON public.listings FOR INSERT
WITH CHECK (
    seller_id = auth.uid()
    AND ownership_type <> 'STREET_CULTURE'
    AND status = 'DRAFT'
    AND authentication_status = 'PENDING'
    AND reserved_at IS NULL
    AND sold_at IS NULL
);

DROP POLICY IF EXISTS "Sellers can update own draft listings" ON public.listings;
CREATE POLICY "Sellers edit drafts; staff manage listings"
ON public.listings FOR UPDATE
USING ((seller_id = auth.uid() AND status = 'DRAFT') OR public.is_staff())
WITH CHECK (
    (
        seller_id = auth.uid()
        AND ownership_type <> 'STREET_CULTURE'
        AND status = 'DRAFT'
        AND authentication_status = 'PENDING'
        AND reserved_at IS NULL
        AND sold_at IS NULL
    ) OR public.is_staff()
);

CREATE INDEX IF NOT EXISTS listings_reserved_by_order_idx
    ON public.listings (reserved_by_order_id)
    WHERE reserved_by_order_id IS NOT NULL;

CREATE TABLE public.shipping_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    region TEXT,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'MZN',
    estimated_min_days INTEGER NOT NULL CHECK (estimated_min_days >= 0),
    estimated_max_days INTEGER NOT NULL CHECK (estimated_max_days >= estimated_min_days),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER shipping_methods_updated_at
BEFORE UPDATE ON public.shipping_methods
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipping_methods FROM PUBLIC, anon, authenticated;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS shipping_method_id UUID REFERENCES public.shipping_methods(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS shipping_method_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS commission_rule_id UUID REFERENCES public.commission_rules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS commission_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Merchant-approved MZN consignment terms: the platform retains 30% of each
-- sale. A more specific seller/brand/category rule can override this later.
INSERT INTO public.commission_rules (
    id, name, seller_type, percentage, fixed_fee, minimum_fee,
    currency, priority, active
) VALUES (
    'a0000000-0000-0000-0000-000000000030',
    'MZN consignment: platform 30%', 'STANDARD', 30, 0, 0,
    'MZN', 0, TRUE
)
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS seller_payouts_one_per_order_item
    ON public.seller_payouts (order_item_id)
    WHERE order_item_id IS NOT NULL;

CREATE TABLE public.order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_events_order_created_idx
    ON public.order_events (order_id, created_at);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order owners view timeline"
ON public.order_events FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.orders AS o
        WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_staff())
    )
);
REVOKE INSERT, UPDATE, DELETE ON public.order_events FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.record_payment_initiated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.provider = 'mpesa' THEN
        INSERT INTO public.order_events (order_id, event_type, metadata)
        VALUES (
            NEW.order_id, 'PAYMENT_INITIATED',
            jsonb_build_object('payment_id', NEW.id)
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER payments_record_initiation
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.record_payment_initiated();

CREATE FUNCTION public.record_seller_payout_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_order_id UUID;
BEGIN
    IF NEW.status = 'PAID' AND OLD.status <> 'PAID' THEN
        SELECT item.order_id INTO target_order_id
        FROM public.order_items AS item
        WHERE item.id = NEW.order_item_id;

        UPDATE public.consignment_submissions AS submission
        SET status = 'PAID', updated_at = NOW()
        WHERE submission.id = (
            SELECT listing.consignment_submission_id
            FROM public.listings AS listing
            WHERE listing.id = NEW.listing_id
              AND listing.ownership_type = 'CONSIGNMENT'
        );

        IF target_order_id IS NOT NULL THEN
            INSERT INTO public.order_events (order_id, event_type, metadata)
            VALUES (
                target_order_id, 'PAYOUT_PAID',
                jsonb_build_object('payout_id', NEW.id)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER seller_payouts_record_payment
AFTER UPDATE OF status ON public.seller_payouts
FOR EACH ROW EXECUTE FUNCTION public.record_seller_payout_paid();

-- The former RPC embedded a shipping price and had no commission snapshot.
DROP FUNCTION IF EXISTS public.create_guest_checkout_order(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
);

CREATE FUNCTION public.create_guest_checkout_order(
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
        OR COALESCE(target_shipping_snapshot->>'country', '') <> 'MZ'
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

    -- Lock listings before the order, matching the expiry worker.
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
        OR payment_record.amount <> order_record.total_amount THEN
        RAISE EXCEPTION 'Payment and order totals do not match';
    END IF;

    can_fulfill := can_fulfill
        AND expected_count > 0
        AND locked_count = expected_count
        AND order_record.status = 'PENDING'
        AND order_record.payment_status = 'UNPAID'
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

    INSERT INTO public.order_events (order_id, event_type, metadata)
    VALUES (
        order_record.id, 'PAYMENT_CONFIRMED',
        jsonb_build_object('payment_id', payment_record.id)
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

CREATE FUNCTION public.fail_guest_checkout_payment(target_payment_id UUID)
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

    UPDATE public.orders
    SET status = 'CANCELLED', payment_status = 'FAILED', updated_at = NOW()
    WHERE id = order_record.id AND status = 'PENDING';

    UPDATE public.listings
    SET status = 'LIVE', reserved_at = NULL,
        reservation_expires_at = NULL, reserved_by_order_id = NULL,
        updated_at = NOW()
    WHERE reserved_by_order_id = order_record.id AND status = 'RESERVED';

    INSERT INTO public.order_events (order_id, event_type, metadata)
    VALUES (
        order_record.id, 'PAYMENT_FAILED',
        jsonb_build_object('payment_id', payment_record.id)
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

-- Supabase Cron runs the database-owned expiry worker every minute. The worker
-- checks the linked order under lock and never releases a paid reservation.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule(
    'street-culture-release-expired-listings',
    '* * * * *',
    'SELECT public.release_expired_listing_reservations()'
);

CREATE FUNCTION public.record_fulfillment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    event_name TEXT;
BEGIN
    IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status THEN
        event_name := CASE NEW.fulfillment_status
            WHEN 'PACKED' THEN 'ORDER_PACKED'
            WHEN 'SHIPPED' THEN 'ORDER_SHIPPED'
            WHEN 'DELIVERED' THEN 'ORDER_DELIVERED'
            ELSE NULL
        END;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'PROCESSING' THEN
        event_name := 'ORDER_PROCESSING';
    END IF;

    IF event_name IS NOT NULL THEN
        INSERT INTO public.order_events (order_id, event_type)
        VALUES (NEW.id, event_name);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER orders_record_fulfillment
AFTER UPDATE OF status, fulfillment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.record_fulfillment_event();

-- The public catalog has one row per currently sellable listing. Security
-- invoker keeps the base tables' RLS in force for anonymous readers.
CREATE VIEW public.public_catalog_listings
WITH (security_invoker = true)
AS
SELECT
    listing.id AS listing_id,
    listing.product_id,
    listing.variant_id,
    listing.ownership_type,
    listing.condition,
    listing.authentication_status,
    listing.asking_price,
    listing.currency,
    listing.published_at,
    product.slug,
    product.name AS product_name,
    product.description,
    product.model,
    product.style_code,
    product.sku,
    product.colorway,
    product.release_year,
    product.featured,
    brand.id AS brand_id,
    brand.name AS brand_name,
    brand.slug AS brand_slug,
    category.id AS category_id,
    category.name AS category_name,
    category.slug AS category_slug,
    variant.size,
    variant.size_system,
    media.storage_path AS image_path,
    concat_ws(' ', product.name, product.model, product.style_code,
        product.sku, brand.name, category.name) AS search_text
FROM public.listings AS listing
JOIN public.products AS product
  ON product.id = listing.product_id AND product.active
JOIN public.brands AS brand
  ON brand.id = product.brand_id AND brand.active
JOIN public.categories AS category
  ON category.id = product.category_id AND category.active
JOIN public.product_variants AS variant
  ON variant.id = listing.variant_id AND variant.product_id = listing.product_id
LEFT JOIN LATERAL (
    SELECT item.storage_path
    FROM public.product_media AS item
    WHERE item.product_id = product.id AND item.media_type = 'IMAGE'
    ORDER BY item.sort_order, item.id
    LIMIT 1
) AS media ON TRUE
WHERE listing.status = 'LIVE'
  AND listing.quantity = 1
  AND listing.currency = 'MZN'
  AND listing.asking_price > 0
  AND listing.authentication_status = 'PASSED';

GRANT SELECT ON public.public_catalog_listings TO anon, authenticated, service_role;
