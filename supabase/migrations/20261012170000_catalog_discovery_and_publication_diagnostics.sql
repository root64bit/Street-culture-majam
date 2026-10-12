-- Product discovery stays listing-backed: anonymous shoppers only receive
-- inventory that already satisfies the live-listing RLS policy.
CREATE OR REPLACE VIEW public.public_catalog_listings
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
    concat_ws(
        ' ',
        product.name,
        product.model,
        product.style_code,
        product.sku,
        brand.name,
        category.name
    ) AS search_text,
    product.most_wanted
FROM public.listings AS listing
JOIN public.products AS product
  ON product.id = listing.product_id
 AND product.active
 AND product.archived_at IS NULL
JOIN public.brands AS brand
  ON brand.id = product.brand_id
 AND brand.active
JOIN public.categories AS category
  ON category.id = product.category_id
 AND category.active
JOIN public.product_variants AS variant
  ON variant.id = listing.variant_id
 AND variant.product_id = listing.product_id
 AND variant.active
LEFT JOIN LATERAL (
    SELECT item.storage_path
    FROM public.product_media AS item
    WHERE item.product_id = product.id
      AND item.media_type = 'IMAGE'
    ORDER BY item.sort_order, item.id
    LIMIT 1
) AS media ON TRUE
WHERE listing.status = 'LIVE'
  AND listing.quantity = 1
  AND listing.currency = 'MZN'
  AND listing.asking_price > 0
  AND listing.authentication_status = 'PASSED';

GRANT SELECT ON public.public_catalog_listings TO anon, authenticated, service_role;

-- Product cards are product-centred even when several exact listings or sizes
-- are available. The selected listing is the lowest-priced available unit;
-- every exact option remains attached for Quick View and checkout resolution.
CREATE OR REPLACE VIEW public.public_catalog_products
WITH (security_invoker = true)
AS
WITH ranked AS (
  SELECT
    row.*,
    row_number() OVER (
      PARTITION BY row.product_id
      ORDER BY row.asking_price, row.published_at DESC NULLS LAST, row.listing_id
    ) AS card_rank
  FROM public.public_catalog_listings AS row
), aggregated AS (
  SELECT
    row.product_id,
    min(row.asking_price) AS lowest_price,
    max(row.published_at) AS latest_published_at,
    array_agg(DISTINCT row.size ORDER BY row.size) AS sizes,
    array_agg(DISTINCT row.condition ORDER BY row.condition) AS conditions,
    jsonb_agg(
      jsonb_build_object(
        'listingId', row.listing_id,
        'size', row.size,
        'price', row.asking_price,
        'condition', row.condition
      ) ORDER BY row.asking_price, row.size, row.listing_id
    ) AS listing_options
  FROM ranked AS row
  GROUP BY row.product_id
)
SELECT
  chosen.listing_id,
  chosen.product_id,
  chosen.variant_id,
  chosen.ownership_type,
  chosen.condition,
  chosen.authentication_status,
  aggregate.lowest_price AS asking_price,
  chosen.currency,
  aggregate.latest_published_at AS published_at,
  chosen.slug,
  chosen.product_name,
  chosen.description,
  chosen.model,
  chosen.style_code,
  chosen.sku,
  chosen.colorway,
  chosen.release_year,
  chosen.featured,
  chosen.brand_id,
  chosen.brand_name,
  chosen.brand_slug,
  chosen.category_id,
  chosen.category_name,
  chosen.category_slug,
  chosen.size,
  chosen.size_system,
  chosen.image_path,
  chosen.search_text,
  chosen.most_wanted,
  aggregate.sizes,
  aggregate.conditions,
  aggregate.listing_options
FROM ranked AS chosen
JOIN aggregated AS aggregate ON aggregate.product_id = chosen.product_id
WHERE chosen.card_rank = 1;

GRANT SELECT ON public.public_catalog_products TO anon, authenticated, service_role;

-- A compact, server-friendly facet payload avoids downloading the complete
-- catalog merely to render filters and homepage category cards.
CREATE OR REPLACE FUNCTION public.public_catalog_facets()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(to_jsonb(facet) ORDER BY facet.sort_order, facet.name)
      FROM (
        SELECT
          row.category_id AS id,
          row.category_name AS name,
          row.category_slug AS slug,
          category.sort_order,
          count(DISTINCT row.product_id) AS product_count,
          (array_agg(row.image_path ORDER BY row.published_at DESC NULLS LAST)
            FILTER (WHERE row.image_path IS NOT NULL))[1] AS image_path
        FROM public.public_catalog_listings AS row
        JOIN public.categories AS category ON category.id = row.category_id
        GROUP BY row.category_id, row.category_name, row.category_slug, category.sort_order
      ) AS facet
    ), '[]'::jsonb),
    'brands', COALESCE((
      SELECT jsonb_agg(to_jsonb(facet) ORDER BY facet.name)
      FROM (
        SELECT
          row.brand_id AS id,
          row.brand_name AS name,
          row.brand_slug AS slug,
          count(DISTINCT row.product_id) AS product_count
        FROM public.public_catalog_listings AS row
        GROUP BY row.brand_id, row.brand_name, row.brand_slug
      ) AS facet
    ), '[]'::jsonb),
    'sizes', COALESCE((
      SELECT jsonb_agg(to_jsonb(facet) ORDER BY facet.size_system, facet.size)
      FROM (
        SELECT row.size, row.size_system, count(*) AS listing_count
        FROM public.public_catalog_listings AS row
        GROUP BY row.size, row.size_system
      ) AS facet
    ), '[]'::jsonb),
    'conditions', COALESCE((
      SELECT jsonb_agg(to_jsonb(facet) ORDER BY facet.condition)
      FROM (
        SELECT row.condition, count(*) AS listing_count
        FROM public.public_catalog_listings AS row
        GROUP BY row.condition
      ) AS facet
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.public_catalog_facets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_catalog_facets() TO anon, authenticated, service_role;

-- Map the existing schema to a clear editorial workflow without introducing a
-- competing status enum. Products remain drafts until an item-level listing is
-- authenticated and published.
CREATE OR REPLACE FUNCTION public.admin_product_publication_diagnostics(target_product_id UUID)
RETURNS TABLE(
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
  valid_media BIGINT;
  variants BIGINT;
  drafts BIGINT;
  lives BIGINT;
  blockers_code TEXT[] := ARRAY[]::TEXT[];
  blockers_message TEXT[] := ARRAY[]::TEXT[];
  has_well_formed_listing BOOLEAN;
  has_passed_authentication BOOLEAN;
BEGIN
  IF NOT public.has_capability('products.read') THEN
    RAISE EXCEPTION 'Catalog read permission required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO item FROM public.products WHERE id = target_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  SELECT active INTO brand_active FROM public.brands WHERE id = item.brand_id;
  SELECT active INTO category_active FROM public.categories WHERE id = item.category_id;
  SELECT count(*) INTO valid_media
  FROM public.product_media AS media
  JOIN storage.objects AS object
    ON object.bucket_id = 'product-images'
   AND object.name = media.storage_path
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
  IF valid_media = 0 THEN
    blockers_code := array_append(blockers_code, 'MEDIA');
    blockers_message := array_append(blockers_message, 'Upload at least one product image to the product-images library.');
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
    blockers_message := array_append(blockers_message, 'Record the item-level authentication decision before publishing.');
  END IF;
  IF lives = 0 AND has_well_formed_listing AND has_passed_authentication THEN
    blockers_code := array_append(blockers_code, 'PUBLICATION');
    blockers_message := array_append(blockers_message, 'Publish an approved listing to make the product public.');
  END IF;

  publicly_visible := item.active
    AND item.archived_at IS NULL
    AND coalesce(brand_active, false)
    AND coalesce(category_active, false)
    AND valid_media > 0
    AND EXISTS (
      SELECT 1 FROM public.public_catalog_listings WHERE product_id = item.id
    );

  stage := CASE
    WHEN item.archived_at IS NOT NULL THEN 'ARCHIVED'
    WHEN publicly_visible THEN 'PUBLISHED'
    WHEN has_passed_authentication AND has_well_formed_listing THEN 'APPROVED'
    WHEN valid_media > 0 AND variants > 0 AND has_well_formed_listing THEN 'READY_FOR_REVIEW'
    ELSE 'DRAFT'
  END;

  blocker_codes := blockers_code;
  blocker_messages := blockers_message;
  media_count := valid_media;
  active_variant_count := variants;
  draft_listing_count := drafts;
  live_listing_count := lives;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_product_publication_diagnostics(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_product_publication_diagnostics(UUID) TO authenticated;
