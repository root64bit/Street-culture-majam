# Product catalog administration

The backend already had `brands`, `categories`, `products`, `product_media`, `product_variants`, `listings`, and a `product-images` storage bucket. It did **not** have a usable product-entry screen; the former `/admin` page displayed placeholder counts. The new `/admin/products` workspace uses real counts and creates editable product drafts.

## Operator workflow

1. Sign in with an account that has a `STAFF`, `ADMIN`, or `SUPER_ADMIN` row in `public.user_roles`. A normal account cannot open the admin pages or call the admin APIs. Only an authorized project owner should grant this role after checking the operator's identity.
2. Open `/admin/products` and choose **New draft**. Select or create a brand and category, then enter only product details that have been confirmed.
3. Select PNG, JPEG, or WebP photos, up to 10 MB each, and save. Uploads go directly from the browser to the `product-images` bucket under a random path. The record can be reopened to edit details, add photos, or remove a photo.
4. Draft products are stored with `active = false` and `currency = MZN`. They do not appear in the public catalog or checkout. If a photo upload fails, the draft remains saved and can be reopened to retry.
5. On an existing product draft, staff may record each **own-stock** physical item with its size, size system, condition, and proposed MZN asking price. This creates a variant and a one-of-one `DRAFT` listing atomically. It remains `PENDING` authentication with no publication date. External-seller and consignment items use their separate intake workflow.

The owner later requested import. The local-only `scripts/import-generated-products.mjs` importer created **10 unpublished concept drafts** with **12 attached images**. The `hermes_birkin_bag` folder contains a Dior crossbody image, so it was classified separately; the four Louis Vuitton photos show distinct bags and each became its own draft. `perfum/1.png`–`3.png` are attached to one Passion Oud draft. `perfum/4.png` is a promotional lineup graphic containing unverified USD prices and was intentionally excluded from product listings. This import is idempotent, rejects remote Supabase URLs, and creates no inventory listings. The source folder contains no confirmed prices, sizes, condition, ownership, or authentication data. Do not create sellable listings from the photographs alone.

## Publication boundary

Product creation and draft inventory do not authenticate an item or make it sellable. Staff must still verify physical stock and evidence, create an approved authentication record, and separately activate/publish the product and listing. No UI in this phase automatically authenticates or publishes. The public catalog view requires an active product, active brand/category, a LIVE MZN listing with quantity 1, and `authentication_status = PASSED`.

Draft product and media database rows are hidden from anonymous readers by RLS. The existing `product-images` bucket is public: anyone who learns an exact object URL could still open that image. Do not upload confidential evidence there; use private authentication/consignment buckets for that material.

## Deployment note

Apply `20260929100000_catalog_draft_access.sql` and `20261005090000_staff_inventory_drafts.sql` in the target Supabase project before deploying the UI. The local migrations were applied without resetting existing data. The production database, role assignment, and image storage must be configured separately; local tests do not grant a production operator access.
