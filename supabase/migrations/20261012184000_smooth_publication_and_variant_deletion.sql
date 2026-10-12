-- Smooth publication and variant management:
-- 1. Make decision_notes optional in publish_store_listing (defaults to verified store stock note).
-- 2. Relax hard storage.objects join requirement so products with any media or placeholder can be published smoothly.
-- 3. Update publication diagnostics so products are publicly visible as soon as active with a live listing.

CREATE OR REPLACE FUNCTION public.publish_store_listing(target_listing_id UUID, decision_notes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    item public.listings%ROWTYPE;
    product_record public.products%ROWTYPE;
    effective_notes TEXT;
BEGIN
    IF NOT public.has_capability('inventory.manage') OR NOT public.has_capability('authentication.review') THEN
        RAISE EXCEPTION 'Inventory and authentication permissions required' USING ERRCODE = '42501';
    END IF;

    effective_notes := coalesce(nullif(btrim(decision_notes), ''), 'Authenticated store stock approved for public listing.');

    SELECT * INTO item FROM public.listings WHERE id = target_listing_id FOR UPDATE;
    IF NOT FOUND OR item.status <> 'DRAFT' OR item.ownership_type <> 'STREET_CULTURE'
       OR item.currency <> 'MZN' OR item.quantity <> 1 OR item.asking_price <= 0 THEN
        RAISE EXCEPTION 'Listing is not eligible for publication';
    END IF;

    SELECT * INTO product_record FROM public.products WHERE id = item.product_id FOR UPDATE;
    IF length(btrim(coalesce(product_record.name, ''))) < 3 THEN
        RAISE EXCEPTION 'Product must have a valid name (at least 3 characters)';
    END IF;

    INSERT INTO public.authentication_records(
        listing_id,
        authenticator_id,
        status,
        condition_confirmed,
        decision_notes,
        authenticated_at
    )
    VALUES (
        item.id,
        auth.uid(),
        'PASSED',
        item.condition,
        effective_notes,
        now()
    );

    UPDATE public.listings
    SET authentication_status = 'PASSED',
        status = 'LIVE',
        published_at = now()
    WHERE id = item.id;

    UPDATE public.products
    SET active = TRUE
    WHERE id = item.product_id;

    INSERT INTO public.admin_audit_logs(actor_id, action, entity_type, entity_id, metadata)
    VALUES (
        auth.uid(),
        'LISTING_PUBLISHED',
        'listing',
        item.id,
        jsonb_build_object('product_id', item.product_id)
    );

    RETURN item.id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_store_listing(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_store_listing(UUID, TEXT) TO authenticated;

-- Drop and recreate diagnostics with relaxed media requirement
DROP FUNCTION IF EXISTS public.admin_product_publication_diagnostics(UUID);

CREATE OR REPLACE FUNCTION public.admin_product_publication_diagnostics(target_product_id UUID)
RETURNS TABLE (
    product_id UUID,
    stage TEXT,
    publicly_visible BOOLEAN,
    blocker_codes TEXT[],
    blocker_messages TEXT[],
    media_count INTEGER,
    active_variant_count INTEGER,
    draft_listing_count INTEGER,
    live_listing_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    item public.products%ROWTYPE;
    brand_active BOOLEAN;
    category_active BOOLEAN;
    media_total INTEGER := 0;
    variants INTEGER := 0;
    drafts INTEGER := 0;
    lives INTEGER := 0;
    has_well_formed_listing BOOLEAN := false;
    has_passed_authentication BOOLEAN := false;
    blockers_code TEXT[] := ARRAY[]::TEXT[];
    blockers_message TEXT[] := ARRAY[]::TEXT[];
BEGIN
    SELECT * INTO item
    FROM public.products
    WHERE id = target_product_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    product_id := item.id;

    SELECT active INTO brand_active FROM public.brands WHERE id = item.brand_id;
    SELECT active INTO category_active FROM public.categories WHERE id = item.category_id;

    SELECT count(*) INTO media_total
    FROM public.product_media AS media
    WHERE media.product_id = item.id AND media.media_type = 'IMAGE';

    SELECT count(*) INTO variants
    FROM public.product_variants
    WHERE product_id = item.id AND active;

    SELECT count(*) FILTER (WHERE status <> 'LIVE'), count(*) FILTER (WHERE status = 'LIVE')
    INTO drafts, lives
    FROM public.listings
    WHERE product_id = item.id;

    SELECT EXISTS (
        SELECT 1
        FROM public.listings AS listing
        JOIN public.product_variants AS variant
          ON variant.id = listing.variant_id
         AND variant.product_id = listing.product_id
         AND variant.active
        WHERE listing.product_id = item.id
          AND listing.status IN ('DRAFT', 'PENDING_REVIEW', 'PENDING_AUTHENTICATION', 'APPROVED', 'LIVE')
          AND listing.quantity = 1
          AND listing.currency = 'MZN'
          AND listing.asking_price > 0
          AND (listing.ownership_type = 'STREET_CULTURE' OR listing.seller_id IS NOT NULL)
    ) INTO has_well_formed_listing;

    SELECT EXISTS (
        SELECT 1 FROM public.listings
        WHERE product_id = item.id AND authentication_status = 'PASSED'
    ) INTO has_passed_authentication;

    IF item.archived_at IS NOT NULL THEN
        blockers_code := array_append(blockers_code, 'ARCHIVED');
        blockers_message := array_append(blockers_message, 'Restore this product as a draft before publishing.');
    END IF;
    IF coalesce(length(btrim(item.name)), 0) < 3 THEN
        blockers_code := array_append(blockers_code, 'METADATA');
        blockers_message := array_append(blockers_message, 'Add a valid product name and required metadata.');
    END IF;
    IF NOT coalesce(brand_active, false) THEN
        blockers_code := array_append(blockers_code, 'BRAND');
        blockers_message := array_append(blockers_message, 'Activate the assigned brand.');
    END IF;
    IF NOT coalesce(category_active, false) THEN
        blockers_code := array_append(blockers_code, 'CATEGORY');
        blockers_message := array_append(blockers_message, 'Activate the assigned category.');
    END IF;
    IF variants = 0 THEN
        blockers_code := array_append(blockers_code, 'VARIANT');
        blockers_message := array_append(blockers_message, 'Create at least one active product variant.');
    END IF;
    IF NOT has_well_formed_listing THEN
        blockers_code := array_append(blockers_code, 'LISTING');
        blockers_message := array_append(blockers_message, 'Create an available one-of-one MZN listing with a valid price.');
    END IF;
    IF lives = 0 AND has_well_formed_listing AND NOT has_passed_authentication THEN
        blockers_code := array_append(blockers_code, 'AUTHENTICATION');
        blockers_message := array_append(blockers_message, 'Click Authenticate & Publish in Listings to make this item public.');
    END IF;

    publicly_visible := item.active
        AND item.archived_at IS NULL
        AND coalesce(brand_active, false)
        AND coalesce(category_active, false)
        AND EXISTS (
            SELECT 1 FROM public.public_catalog_listings WHERE product_id = item.id
        );

    stage := CASE
        WHEN item.archived_at IS NOT NULL THEN 'ARCHIVED'
        WHEN publicly_visible THEN 'PUBLISHED'
        WHEN has_passed_authentication AND has_well_formed_listing THEN 'APPROVED'
        WHEN variants > 0 AND has_well_formed_listing THEN 'READY_FOR_REVIEW'
        ELSE 'DRAFT'
    END;

    blocker_codes := blockers_code;
    blocker_messages := blockers_message;
    media_count := media_total;
    active_variant_count := variants;
    draft_listing_count := drafts;
    live_listing_count := lives;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_product_publication_diagnostics(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_product_publication_diagnostics(UUID) TO authenticated;
