# Admin and product-folder audit

Audited 5 October 2026 against the current repository and `C:\Users\YUNI\Downloads\projectos developing\Street culture docs\products`. No source asset was renamed, deleted, or uploaded during the audit.

## Current admin capabilities

- `/admin` shows live counts for products, live/draft listings, and open orders. It links to product drafts. It does not yet provide operational modules for orders, payments, consignments, payouts, taxonomy, imports, or reports.
- `/admin/products` lists up to 200 products, without search, paging, bulk actions, or export. Its editor creates/updates unpublished products and directly uploads/removes product photos. Staff can add one-of-one own-stock draft listings via `create_staff_inventory_draft`.
- Existing product APIs and taxonomy creation require `is_staff()`. That includes `STAFF`, `ADMIN`, and `SUPER_ADMIN`; it is not sufficiently narrow for bulk import or sensitive mutations. `AUTHENTICATOR` has separate authentication access in SQL.
- Canonical tables exist for brands, categories, products, product media, variants, listings, orders, payments, consignment submissions, authentication records, seller payouts, and commission rules. The `product-images` bucket accepts JPEG/PNG/WebP up to 10 MB and is public; authentication evidence belongs in private buckets.
- `scripts/import-generated-products.mjs` is a local-only, hard-coded, idempotent concept-photo importer. It previously created 10 local unpublished products with 12 photos, but refuses cloud URLs and has no workbook parsing, review batches, transaction, or production import. It excludes the promotional fragrance collage.

## Source inventory

All 13 files are valid PNG images, 1.8–2.8 MB each. Dimensions range from 1,122×1,402 to 1,916×821. SHA-256 hashes found no byte-identical duplicates. Folder and filename are the only machine-readable clues; no SKU/style code, size, price, stock, condition, ownership, product reference, or authenticity record exists in filenames.

| File | Visual assessment | Tentative group |
| --- | --- | --- |
| `dior/1.png` | Dior-patterned tote | Dior tote candidate |
| `hermes_birkin_bag/1.png` | Tan top-handle bag | Hermès tan top-handle candidate |
| `hermes_birkin_bag/2.png` | Taupe top-handle bag, distinct from image 1 | Hermès taupe top-handle candidate |
| `hermes_birkin_bag/3.png` | Dior-monogram crossbody, not Hermès | Dior crossbody candidate |
| `Lv/1.png` | Monogram duffle | Louis Vuitton duffle candidate |
| `Lv/2.png` | Monogram backpack | Louis Vuitton backpack candidate |
| `Lv/3.png` | Monogram tote | Louis Vuitton tote candidate |
| `Lv/4.png` | Monogram top-handle/duffle shape, visually distinct from image 1 | Louis Vuitton top-handle candidate |
| `perfum/1.png` | Street Culture Passion Oud bottle and box | Passion Oud candidate, image 1 |
| `perfum/2.png` | Street Culture Passion Oud bottle | Passion Oud candidate, image 2 |
| `perfum/3.png` | Street Culture Passion Oud presentation box | Passion Oud candidate, image 3 |
| `perfum/4.png` | Seven-fragrance marketing lineup with USD price text | Promotional art only; **not** seven verified products |
| `prada/ChatGPT Image Sep 28, 2026, 02_49_05 PM.png` | Black Prada-style backpack | Prada backpack candidate |

The likely brands are Dior, Hermès, Louis Vuitton, Prada, and Street Culture. Likely categories are bags and fragrance. Ten product candidates use 12 images; the thirteenth image is a marketing composite. The merchant has separately confirmed that these are real, authenticated, store-owned units, with one new STANDARD-size unit per candidate. This confirmation is not inferred from the images or filenames.

## Naming and data gaps

- Numeric basenames are ambiguous across folders. `Lv` uses inconsistent capitalization; `perfum` is misspelled; `hermes_birkin_bag/3.png` belongs with Dior. The timestamped Prada filename contains no product reference.
- The two Hermès photos and four Louis Vuitton photos show different items rather than gallery angles of one item. Treating a folder as one product would incorrectly merge them.
- Image pixels alone do not establish exact model, material, asking price, or image usage rights. The fragrance collage contains promotional USD amounts, not approved MZN selling prices.
- Some files have image-generation cues, including a `ChatGPT Image` filename. The merchant asserts real authenticated stock, but an operator should still confirm these images accurately represent the physical items before publication.

## Recommended import boundary

Create a repeatable folder scanner that emits a file manifest and ten reviewed candidate records with stable references and source hashes. Stage all candidates with `REQUIRES_REVIEW`, retain the approved stock defaults, leave exact models and selling prices blank, and exclude the promotional image from product media. Allow an admin to amend and approve metadata and image rights. Only then create catalog, variants, and listings. Do not publish a listing merely because a row parses or a product image exists.
