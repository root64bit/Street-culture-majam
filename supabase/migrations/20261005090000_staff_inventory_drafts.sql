-- Staff can record own-stock inventory without granting broad listing INSERT
-- privileges or treating unverified photographs as sellable inventory.
CREATE OR REPLACE FUNCTION public.create_staff_inventory_draft(
    target_product_id UUID,
    target_size TEXT,
    target_size_system TEXT,
    target_condition TEXT,
    target_asking_price NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    created_variant_id UUID;
    created_listing_id UUID;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_staff() THEN
        RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
    END IF;

    IF target_size IS NULL OR length(btrim(target_size)) NOT BETWEEN 1 AND 24
       OR target_size_system IS NULL OR target_size_system NOT IN ('US', 'UK', 'EU', 'CM', 'STANDARD')
       OR target_condition IS NULL OR target_condition NOT IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR')
       OR target_asking_price IS NULL
       OR target_asking_price <= 0
       OR target_asking_price > 9999999999.99
       OR target_asking_price <> round(target_asking_price, 2) THEN
        RAISE EXCEPTION 'Invalid draft inventory details';
    END IF;

    -- Only an unpublished canonical record may receive inventory through this
    -- staging workflow. The lock prevents concurrent activation during insert.
    PERFORM 1 FROM public.products
    WHERE id = target_product_id AND active = FALSE
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unpublished product draft not found';
    END IF;

    INSERT INTO public.product_variants (product_id, size, size_system)
    VALUES (target_product_id, btrim(target_size), target_size_system)
    RETURNING id INTO created_variant_id;

    INSERT INTO public.listings (
        product_id, variant_id, seller_id, ownership_type,
        condition, status, asking_price, currency, quantity,
        authentication_status, published_at
    ) VALUES (
        target_product_id, created_variant_id, NULL, 'STREET_CULTURE',
        target_condition, 'DRAFT', target_asking_price, 'MZN', 1,
        'PENDING', NULL
    ) RETURNING id INTO created_listing_id;

    RETURN created_listing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_inventory_draft(UUID, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff_inventory_draft(UUID, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
