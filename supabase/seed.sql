-- ==============================================================================
-- STREET CULTURE - Seed Data (Development & Demo Environments)
-- ==============================================================================

-- 1. BRANDS SEED
INSERT INTO public.brands (id, name, slug, description, featured, active)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Nike', 'nike', 'Global innovator in athletic footwear and streetwear grails.', true, true),
    ('b0000000-0000-0000-0000-000000000002', 'Jordan', 'jordan', 'The legendary basketball lineage redefined for street culture.', true, true),
    ('b0000000-0000-0000-0000-000000000003', 'Adidas', 'adidas', 'Pioneering performance and iconic cultural collaborations.', true, true),
    ('b0000000-0000-0000-0000-000000000004', 'New Balance', 'new-balance', 'Heritage craftsmanship and elevated lifestyle silhouettes.', true, true),
    ('b0000000-0000-0000-0000-000000000005', 'Supreme', 'supreme', 'New York skateboarding foundation turned global luxury powerhouse.', true, true),
    ('b0000000-0000-0000-0000-000000000006', 'Stussy', 'stussy', 'The godfather of Southern California streetwear culture.', true, true),
    ('b0000000-0000-0000-0000-000000000007', 'Corteiz', 'corteiz', 'London underground rebellion leading contemporary streetwear.', true, true),
    ('b0000000-0000-0000-0000-000000000008', 'BAPE', 'bape', 'A Bathing Ape Tokyo Harajuku camouflaged archival aesthetics.', true, true),
    ('b0000000-0000-0000-0000-000000000009', 'Off-White', 'off-white', 'Virgil Abloh defining the grey area between black and white.', true, true),
    ('b0000000-0000-0000-0000-000000000010', 'Fear of God', 'fear-of-god', 'Jerry Lorenzo luxury sportswear and essential tailoring.', true, true),
    ('b0000000-0000-0000-0000-000000000011', 'Dior', 'dior', 'Parisian high couture intersecting with modern subcultures.', true, true),
    ('b0000000-0000-0000-0000-000000000012', 'Prada', 'prada', 'Italian modernism, innovative re-nylon, and avant-garde luxury.', true, true),
    ('b0000000-0000-0000-0000-000000000013', 'Louis Vuitton', 'louis-vuitton', 'Historic luxury luggage and Virgil Abloh runway archives.', true, true),
    ('b0000000-0000-0000-0000-000000000014', 'Balenciaga', 'balenciaga', 'Demna Gvasalia subversive high fashion and architectural silhouettes.', true, true)
ON CONFLICT (id) DO NOTHING;

-- 2. CATEGORIES SEED
INSERT INTO public.categories (id, parent_id, name, slug, description, sort_order, active)
VALUES
    ('c0000000-0000-0000-0000-000000000001', null, 'Sneakers', 'sneakers', 'Authenticated archival sneakers, rare prototypes, and grail releases.', 1, true),
    ('c0000000-0000-0000-0000-000000000002', null, 'Streetwear', 'streetwear', 'Exclusive drops, box logos, jackets, and essential streetwear pieces.', 2, true),
    ('c0000000-0000-0000-0000-000000000003', null, 'Luxury', 'luxury', 'High-fashion runway garments, tailored coats, and designer ready-to-wear.', 3, true),
    ('c0000000-0000-0000-0000-000000000004', null, 'Bags', 'bags', 'Archival trunks, duffles, cross-body bags, and leather goods.', 4, true),
    ('c0000000-0000-0000-0000-000000000005', null, 'Accessories', 'accessories', 'Belts, eyewear, caps, jewelry, and certified vault hardware.', 5, true),
    ('c0000000-0000-0000-0000-000000000006', null, 'Collectibles', 'collectibles', 'Art objects, Bearbricks, sculptures, and rare cultural relics.', 6, true)
ON CONFLICT (id) DO NOTHING;

-- 3. COMMISSION RULES SEED
INSERT INTO public.commission_rules (id, name, seller_type, percentage, fixed_fee, minimum_fee, active)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Standard Seller Protocol', 'STANDARD', 12.00, 5.00, 10.00, true),
    ('a0000000-0000-0000-0000-000000000002', 'Verified VIP Consignor', 'VIP', 8.00, 3.00, 6.00, true),
    ('a0000000-0000-0000-0000-000000000003', 'Enterprise Liquidity Partner', 'ENTERPRISE', 5.00, 0.00, 5.00, true)
ON CONFLICT (id) DO NOTHING;

-- 4. PRODUCTS (SAMPLE ARCHIVAL SPECIMENS)
INSERT INTO public.products (
    id, brand_id, category_id, name, slug, description, model, sku, colorway, release_year, gender, retail_price, currency, featured, active
)
VALUES
    (
        'd0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000009',
        'c0000000-0000-0000-0000-000000000001',
        'A/X Prototype Runner ''Acid Void''',
        'ax-prototype-runner-acid-void',
        'Archival high-top concept runner featuring carbon-fiber support trusses, tactical quick-cord lacing, and reactive UV neon highlights. Specimen verified through multi-point cryptographic inspection.',
        'Prototype Runner V4',
        'AX-PROTO-9084',
        'Acid Void / Black / Neon',
        2024,
        'UNISEX',
        2400.00,
        'USD',
        true,
        true
    ),
    (
        'd0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000001',
        'Air Jordan 1 Retro High OG ''Chicago Lost & Found''',
        'air-jordan-1-retro-high-og-chicago-lost-and-found',
        'The timeless 1985 classic silhouette reimagined with cracked vintage leather collar and aged sail midsole aesthetic.',
        'Air Jordan 1',
        'DZ5485-612',
        'Varsity Red / Black / Sail / Muslin',
        2022,
        'MEN',
        180.00,
        'USD',
        true,
        true
    ),
    (
        'd0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000005',
        'c0000000-0000-0000-0000-000000000002',
        'Supreme Box Logo Hooded Sweatshirt ''Heather Grey''',
        'supreme-box-logo-hooded-sweatshirt-heather-grey',
        'Heavyweight crossgrain fleece with classic embroidered red and white box logo across the chest.',
        'Box Logo Hoodie',
        'SUP-FW23-BOGO-GRY',
        'Heather Grey / Red',
        2023,
        'UNISEX',
        168.00,
        'USD',
        true,
        true
    ),
    (
        'd0000000-0000-0000-0000-000000000004',
        'b0000000-0000-0000-0000-000000000011',
        'c0000000-0000-0000-0000-000000000001',
        'Dior x Air Jordan 1 High OG',
        'dior-x-air-jordan-1-high-og',
        'Made in Italy with Dior grey calfskin leather, hand-painted edges, and iconic jacquard oblique monogram swoosh.',
        'Air Jordan 1 High',
        'CN8607-002',
        'Wolf Grey / Sail / Photon Dust / White',
        2020,
        'MEN',
        2200.00,
        'USD',
        true,
        true
    ),
    (
        'd0000000-0000-0000-0000-000000000005',
        'b0000000-0000-0000-0000-000000000013',
        'c0000000-0000-0000-0000-000000000004',
        'Louis Vuitton Horizon 55 Monogram Eclipse',
        'louis-vuitton-horizon-55-monogram-eclipse',
        'Designed by Marc Newson. Ultra-light rolling luggage crafted in Monogram Eclipse canvas with wide pull handle.',
        'Horizon 55',
        'M23002',
        'Black / Monogram Eclipse',
        2023,
        'UNISEX',
        3400.00,
        'USD',
        false,
        true
    )
ON CONFLICT (id) DO NOTHING;

-- 5. PRODUCT MEDIA
INSERT INTO public.product_media (id, product_id, storage_path, media_type, sort_order, alt_text)
VALUES
    ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '/images/street-culture-products.png', 'IMAGE', 0, 'A/X Prototype Runner Acid Void Front Profile'),
    ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '/images/street-culture-products.png', 'IMAGE', 0, 'Air Jordan 1 Chicago Lost & Found Lateral View'),
    ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', '/images/street-culture-products.png', 'IMAGE', 0, 'Supreme Box Logo Grey Hoodie Front'),
    ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', '/images/street-culture-products.png', 'IMAGE', 0, 'Dior Air Jordan 1 High OG Lateral Specimen'),
    ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', '/images/street-culture-products.png', 'IMAGE', 0, 'Louis Vuitton Horizon 55 Rolling Luggage')
ON CONFLICT (id) DO NOTHING;

-- 6. PRODUCT VARIANTS
INSERT INTO public.product_variants (id, product_id, size, size_system, color, sku)
VALUES
    ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '10.5', 'US', 'Acid Void', 'AX-PROTO-9084-105'),
    ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', '11.0', 'US', 'Acid Void', 'AX-PROTO-9084-110'),
    ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', '9.5', 'US', 'Chicago', 'DZ5485-612-95'),
    ('f0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', '10.0', 'US', 'Chicago', 'DZ5485-612-100'),
    ('f0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003', 'L', 'US', 'Heather Grey', 'SUP-BOGO-GRY-L'),
    ('f0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000004', '10.0', 'US', 'Wolf Grey', 'CN8607-002-100'),
    ('f0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000005', 'OS', 'STANDARD', 'Eclipse', 'M23002-OS')
ON CONFLICT (id) DO NOTHING;

-- Local development inventory. Production catalog records are created through
-- the existing product/listing administration flow, not this seed file.
INSERT INTO public.listings (
    id, product_id, variant_id, seller_id, ownership_type,
    condition, status, asking_price, currency, quantity,
    authentication_status, published_at
)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', NULL, 'STREET_CULTURE', 'NEW', 'LIVE', 2840, 'MZN', 1, 'PASSED', NOW() - INTERVAL '1 day'),
    ('10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', NULL, 'STREET_CULTURE', 'NEW', 'LIVE', 2990, 'MZN', 1, 'PASSED', NOW() - INTERVAL '2 days'),
    ('10000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003', NULL, 'STREET_CULTURE', 'NEW', 'LIVE', 3950, 'MZN', 1, 'PASSED', NOW() - INTERVAL '3 days'),
    ('10000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', NULL, 'STREET_CULTURE', 'NEW', 'LIVE', 4150, 'MZN', 1, 'PASSED', NOW() - INTERVAL '5 days'),
    ('10000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000005', NULL, 'STREET_CULTURE', 'NEW', 'LIVE', 1680, 'MZN', 1, 'PASSED', NOW() - INTERVAL '7 days'),
    ('10000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000006', NULL, 'STREET_CULTURE', 'NEW', 'LIVE', 7850, 'MZN', 1, 'PASSED', NOW() - INTERVAL '10 days'),
    ('10000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000007', NULL, 'STREET_CULTURE', 'NEW', 'LIVE', 3400, 'MZN', 1, 'PASSED', NOW() - INTERVAL '15 days')
ON CONFLICT (id) DO NOTHING;
