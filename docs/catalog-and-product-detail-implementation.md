# Catalog and product detail implementation

## Catalog

`/shop` is the central database-driven catalog. It uses a product-centred Supabase view so multiple live sizes/listings do not create duplicate cards.

The server query supports:

- search by product name, brand, model, style code and SKU;
- category, brand, size, condition and minimum/maximum MZN price;
- featured, newest, price ascending/descending and brand sorting;
- exact result counts and server-side pagination;
- shareable URL parameters;
- desktop filter sidebar and a sticky mobile filter drawer;
- a verified-only, available-now public inventory boundary.

Facet counts and homepage category cards come from `public_catalog_facets()`. The browser does not download the full catalog to calculate filters.

## Product details

`/products/[slug]` resolves a unique, public, sellable product. Active-but-unsellable products return not found rather than exposing a non-purchasable detail page.

The page includes:

- Supabase Storage-backed image gallery, thumbnails and full-screen viewing;
- brand, category, model, colorway, style code, release year and description;
- live listing options with exact size, condition and price;
- price updates when a different exact listing is selected;
- Add to Bag and Buy Now using the selected listing ID;
- wishlist, share, trust information and related real products;
- mobile sticky purchase controls.

The server validates live inventory again during cart/checkout. A client-side selection cannot make a draft, reserved or sold listing purchasable.

## Quick View and checkout

Quick View now receives the aggregated listing options, resolves size to the correct exact listing, updates the displayed price and condition, and sends that listing ID to the existing bag/checkout flow. It also links to the unique product page.

The existing guest checkout and MineScope/M-Pesa integration were preserved. Square remains gated by its existing configuration and is not represented as operational when unconfigured.

## SEO and discovery

- dynamic title, description, canonical URL and Open Graph metadata per product;
- product JSON-LD generated from actual product/listing data;
- `/sitemap.xml` includes only published product slugs;
- `/robots.txt` advertises the sitemap and excludes admin/account/API routes;
- global metadata uses the configured production site URL;
- invalid or unpublished slugs use proper not-found handling.

## Security

Public reads use `security_invoker` views and the existing row-level policies. They do not include private seller details, admin metadata or authentication evidence. Privileged publication diagnostics require the `products.read` capability, and all publication mutations remain server-authorized.
