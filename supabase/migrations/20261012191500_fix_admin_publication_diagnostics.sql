-- Fix ambiguous product_id in admin_product_publication_diagnostics
DROP FUNCTION IF EXISTS public.admin_product_publication_diagnostics(UUID);

CREATE OR REPLACE FUNCTION public.admin_product_publication_diagnostics(target_product_id UUID)
RETURNS TABLE (
    stage TEXT,
    publicly_visible BOOLEAN,
    blocker_codes TEXT[],
    blocker_messages TEXT[],
    media_count BIGINT,
    active_variant_count BIGINT,
    draft_listing_count BIGINT,
    live_listing_count BIGINT
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
    media_total BIGINT := 0;
    variants BIGINT := 0;
    drafts BIGINT := 0;
    lives BIGINT := 0;
    has_well_formed_listing BOOLEAN := false;
    has_passed_authentication BOOLEAN := false;
    blockers_code TEXT[] := ARRAY[]::TEXT[];
    blockers_message TEXT[] := ARRAY[]::TEXT[];
BEGIN
    SELECT * INTO item
    FROM public.products AS p
    WHERE p.id = target_product_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT b.active INTO brand_active FROM public.brands AS b WHERE b.id = item.brand_id;
    SELECT c.active INTO category_active FROM public.categories AS c WHERE c.id = item.category_id;

    SELECT count(*) INTO media_total
    FROM public.product_media AS pm
    WHERE pm.product_id = item.id AND pm.media_type = 'IMAGE';

    SELECT count(*) INTO variants
    FROM public.product_variants AS pv
    WHERE pv.product_id = item.id AND pv.active;

    SELECT count(*) FILTER (WHERE l.status <> 'LIVE'), count(*) FILTER (WHERE l.status = 'LIVE')
    INTO drafts, lives
    FROM public.listings AS l
    WHERE l.product_id = item.id;

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
        SELECT 1 FROM public.listings AS l
        WHERE l.product_id = item.id AND l.authentication_status = 'PASSED'
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
            SELECT 1 FROM public.public_catalog_listings AS pcl WHERE pcl.product_id = item.id
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
