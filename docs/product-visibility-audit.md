# Product visibility audit

Audit date: 2026-10-12

## Executive finding

The empty production storefront is a data/publication-state problem, not a hardcoded homepage problem. A read-only anonymous query against the production Supabase project returned:

- zero rows from `public_catalog_listings`;
- zero active public products;
- one active category (`Bags`).

Therefore no production item currently satisfies the complete public-sale contract. The storefront correctly has no sellable record to render.

## Record-level limitation

The two private admin records could not be inspected individually during this audit. The existing browser admin session had expired, and the Vercel integration intentionally did not expose the production service-role secret. Their names, record IDs, listing states, media rows and exact blockers are consequently not asserted here.

No production data was changed. This follows the instruction to perform read-only production diagnostics and not deploy or mutate production without explicit authorization.

To complete the final two-record audit, sign in to the production admin and open each product. The new diagnostics panel will return exact blockers after the migration and application are deployed.

## Public visibility contract

A product appears to an anonymous shopper only when all of the following are true:

1. The product is active and not archived.
2. Its brand and category are active.
3. It has an active variant belonging to the product.
4. It has a listing with status `LIVE`.
5. The listing has quantity `1`, a positive MZN price and authentication status `PASSED`.
6. A valid item image exists in the `product-images` storage bucket before publication.
7. The listing is readable through the existing RLS-backed public view.

Homepage merchandising is applied only after this contract is met. `most_wanted` and `featured` change priority; they do not make an unpublished product public.

## Pipeline traced

The audited flow is:

`admin product draft → products → product_media/storage → product_variants → listings → item authentication → publish_store_listing → public_catalog_listings → public_catalog_products → storefront`

Admin-created and imported rows are intentionally drafts. Importing metadata alone does not create a sellable public product. The existing publication RPC remains the authority for item-level authentication and publication.

## Correction implemented locally

- `public_catalog_listings` now expresses the complete sellable-listing contract while retaining RLS through `security_invoker`.
- `public_catalog_products` aggregates exact live listings into one product card and carries every listing option for size/price resolution.
- `public_catalog_facets()` returns only counts and imagery derived from eligible public inventory.
- `admin_product_publication_diagnostics(product_id)` maps the existing schema to `DRAFT → READY_FOR_REVIEW → APPROVED → PUBLISHED → ARCHIVED` and returns exact blocker codes and repair messages.
- The admin product workspace displays `PUBLICLY VISIBLE` or `NOT PUBLIC — ACTION REQUIRED` with direct links to metadata, media, variants/listings and publication controls.

## Status of the two production products

| Question                                                            | Verified result                                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Do the private product rows exist?                                  | Not verifiable without an authenticated admin session.                                       |
| Do they have brand/category, media, variants and listings?          | Not verifiable from anonymous access.                                                        |
| Are they approved, live and anonymous-readable?                     | No. Production returned zero public catalog rows.                                            |
| Does the homepage exclude them only because of merchandising flags? | No. There are no eligible public products before merchandising is applied.                   |
| Were the production records changed?                                | No.                                                                                          |
| Are both now publicly visible in production?                        | No claim can be made until deployment and an authorized admin completes any listed blockers. |

## Safe production completion procedure

1. Authorize deployment of the migration and application commit.
2. Sign in to the production admin.
3. Open each of the two products and record the diagnostic result.
4. Correct only the displayed blockers.
5. Authenticate and publish the exact listing; do not duplicate the product.
6. Verify anonymously that the product appears in `/shop`, its product detail page and the homepage when selected for merchandising.
