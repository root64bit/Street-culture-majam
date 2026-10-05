-- Add payment idempotency metadata and expiring inventory holds.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_idempotency_unique
    ON public.payments (provider, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_unique
    ON public.payments (provider, provider_reference)
    WHERE provider_reference IS NOT NULL;

ALTER TABLE public.listings
    ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.reserve_listing(target_listing_id UUID, buyer_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    listing_row public.listings%ROWTYPE;
BEGIN
    SELECT * INTO listing_row
    FROM public.listings
    WHERE id = target_listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing % not found', target_listing_id;
    END IF;

    IF listing_row.status != 'LIVE' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.listings
    SET status = 'RESERVED',
        reserved_at = NOW(),
        reservation_expires_at = NOW() + INTERVAL '15 minutes',
        updated_at = NOW()
    WHERE id = target_listing_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.release_expired_listing_reservations()
RETURNS INTEGER AS $$
DECLARE
    released_count INTEGER;
BEGIN
    WITH released AS (
        UPDATE public.listings AS listing
        SET status = 'LIVE',
            reserved_at = NULL,
            reservation_expires_at = NULL,
            updated_at = NOW()
        WHERE listing.status = 'RESERVED'
          AND listing.reservation_expires_at <= NOW()
          AND NOT EXISTS (
              SELECT 1
              FROM public.order_items AS item
              JOIN public.orders AS order_record ON order_record.id = item.order_id
              WHERE item.listing_id = listing.id
                AND order_record.payment_status = 'PAID'
          )
        RETURNING listing.id
    ), cancelled_orders AS (
        UPDATE public.orders AS order_record
        SET status = 'CANCELLED',
            payment_status = 'FAILED',
            updated_at = NOW()
        WHERE order_record.status = 'PENDING'
          AND order_record.payment_status = 'UNPAID'
          AND EXISTS (
              SELECT 1
              FROM public.order_items AS item
              JOIN released ON released.id = item.listing_id
              WHERE item.order_id = order_record.id
          )
        RETURNING order_record.id
    )
    SELECT COUNT(*)::INTEGER INTO released_count FROM released;

    RETURN COALESCE(released_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.release_expired_listing_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_listing_reservations() TO service_role;
