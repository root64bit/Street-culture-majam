-- Draft product details remain staff-only until the product is activated.
DROP POLICY IF EXISTS "Public read product media" ON public.product_media;
CREATE POLICY "Read media for active products or staff"
ON public.product_media FOR SELECT
USING (
    public.is_staff()
    OR EXISTS (
        SELECT 1 FROM public.products AS product
        WHERE product.id = product_id AND product.active
    )
);

DROP POLICY IF EXISTS "Public read product variants" ON public.product_variants;
CREATE POLICY "Read variants for active products or staff"
ON public.product_variants FOR SELECT
USING (
    public.is_staff()
    OR EXISTS (
        SELECT 1 FROM public.products AS product
        WHERE product.id = product_id AND product.active
    )
);
