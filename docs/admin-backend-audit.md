# STREET CULTURE admin and backend audit

Audited against the repository and the running **local** Supabase schema on 6 October 2026. This is a baseline for implementation, not a production certification. The cloud project was not changed during this audit.

For the changes made after this baseline, see `admin-implementation-status.md`.

## Architecture and source of truth

- Next.js 15 App Router: server-rendered catalog/account/admin pages, route handlers under `/api`, and Supabase SSR middleware. The middleware checks sign-in; page and API helpers repeat role checks server-side. There are no server actions.
- Browser Supabase calls currently create consignments and manage product images. Service-role Supabase is only instantiated server-side for checkout, shipping lookup, M-Pesa, and guest order lookup. Secrets are not imported into client components.
- The public storefront reads the `public_catalog_listings` **security-invoker** view. Live/approved/MZN/one-unit filters are in the view. There is a hardcoded `storeProducts` sample array in `src/data/storefront.ts`, but the current homepage and catalog service query Supabase rather than that array.
- MineScope code is server-only, pins the documented HTTPS host, derives deterministic provider references from an idempotency key, and treats accepted push requests as pending. The browser status poll is currently the only routine reconciliation path; a paid response after a customer leaves checkout may wait indefinitely for reconciliation. No callback or scheduled worker is present.
- Product import stages rows and commits each product/variant/listing group in a PostgreSQL transaction. It never publishes automatically. The import UI is create-only; update/export are not implemented.
- Notifications have a table and a development-only intent logger, but no production delivery or operational inbox. There is no admin background task scheduler.

## Current admin module matrix

`Yes` means a real Supabase read/write exists; `Partial` means the route exists but lacks the requested operational workflow. All missing modules have no route today.

| Module / route | Real read | Real write | Role guard | Filters / paging / detail | Audit and tests | Baseline |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard `/admin` | Yes: four counts | No | STAFF+ | No / no / no | No action log; browser access test | Partial; decorative placeholders for inventory and orders |
| Products `/admin/products` | Yes: 200 recent | No | STAFF+ | No / capped, not paged / edit link for admin | Draft E2E | Partial |
| New product `/admin/products/new` | Yes: taxonomy | Yes: draft, media, taxonomy | ADMIN+ | N/A | Draft E2E; no create audit | Partial |
| Product detail `/admin/products/[id]` | Yes | Yes: draft, image, own-stock listing, publication | ADMIN+ | No tabs / no history | Publication RPC audit; partial E2E | Partial |
| Imports `/admin/imports` | Yes: 50 recent | Yes: stage | ADMIN+ | No / capped / batch detail | Import E2E + SQL test | Partial; no export or update mode |
| Import detail `/admin/imports/[id]` | Yes: up to 500 rows | Yes: confirm | ADMIN+ | Row preview / error workbook | Import E2E + SQL test | Partial; no row correction |
| Inventory, orders, payments, reconciliation, shipping | No | No | N/A | No | No admin E2E | Missing |
| Consignments, authentication, sellers, payouts, commissions | No | No | N/A | No | No admin E2E | Missing |
| Brands, categories, media | Only embedded in product editor | Only simple taxonomy create and product image CRUD | ADMIN+ | No dedicated routes | No module tests | Missing as modules |
| Customers, reports, audit, staff, settings, notifications | No | No | N/A | No | No admin E2E | Missing |

There is no `/admin/layout.tsx`: the storefront header/footer surround admin pages. There is no admin search, breadcrumbs, sidebar, pagination, common table component, or operational empty-state system. Customer account pages are separate routes.

## Local database inventory

The local database has **28 public tables, 1 security-invoker catalog view, 20 public functions, 23 user triggers, and 52 public indexes** after ten migrations. Major records: brands/categories/products/product_variants/product_media/listings; carts/cart_items/wishlist_items/offers; orders/order_items/order_events/payments/shipping_methods; consignment_submissions/consignment_media/authentication_records/commission_rules/seller_payouts; profiles/seller_profiles/user_roles/notifications; product_import_batches/product_import_rows/admin_audit_logs; guest_checkout_rate_limits.

Existing business safeguards include unique product slug, case-insensitive variant SKU, import reference, provider/idempotency references, open M-Pesa payment per order, payout per order item, and order guest-token hash. Checkout reservation and paid completion use PostgreSQL functions and row locks. `complete_guest_checkout_payment` avoids a second sale, creates seller payouts only for non-own-stock items, and records a paid-but-unfulfillable order for review. The import/publication functions enforce draft-first and one-of-one stock. These are strengths to preserve.

Schema gaps for the requested workflow: variants have no `active`, quantity, or price-override fields; quantity and asking price live on listings. Products have no SEO title/description; brands have no sort-order column. No admin notes, assignment, checklists, reimbursement/refund requests, staff disable flag, operational notification subtype, provider reconciliation history, or general audit linkage exists. Order and fulfillment enums are separate, but do not exactly match the proposed detailed state machine (e.g. no `PACKED` order state, no `READY_FOR_PICKUP` fulfillment state). Migration design must respect existing paid orders and statuses rather than replace them wholesale.

## RLS and role findings

All 28 public tables have RLS enabled. `shipping_methods` and `guest_checkout_rate_limits` have **no RLS policy**, so they are service-role-only today. The following is the effective policy intent, not a substitute for live-role verification.

| Tables | Anon / own-user access | STAFF access | ADMIN access | Finding |
| --- | --- | --- | --- | --- |
| `products`, `brands`, `categories`, `product_variants`, `product_media` | Public active catalog | Read all | Manage all | Appropriate baseline, but no catalog capability split or mutation audit |
| `listings` | Public live-approved; seller own | Read all | No direct admin write policy; publication through RPC | Seller draft UPDATE is broad across editable columns; tighten state/price rules |
| `orders` | Owner read | **ALL write** | Inherited STAFF | Broad direct order mutation bypasses business transitions and audit |
| `order_items`, `order_events` | Owner read | Read via order | No direct write policy | Service-role workflows write; no admin note route |
| `payments` | Owner read | Read all | No direct write | Safe against direct paid marking, but no reconciliation UI |
| `seller_payouts` | Seller own read | **ALL write** | Inherited STAFF | Critical: staff can mark payouts PAID without finance permission or proof |
| `commission_rules` | Public active read | **ALL write** | Inherited STAFF | Critical: any staff can change commercial rules |
| `consignment_submissions`, `consignment_media` | Seller own create/read/edit draft; private media | Authenticator via `is_authenticator()` | Inherited auth/STAFF | No audited operator transition service; UPDATE policy permits broad field changes |
| `authentication_records` | Seller own read | Authenticator/STAFF read/write | Manage | No structured checklist; decisions not tied to a protected transition |
| `profiles` | **Public SELECT all rows and columns** | Same | Same | Critical privacy gap: phone and account fields exposed to anon |
| `seller_profiles` | **Public SELECT all rows and columns** | Same | Same | Sales/verification data exposed; self-management is broad |
| `user_roles` | User own SELECT | Read all | **ALL write** | ADMIN can assign/remove `SUPER_ADMIN`; no superadmin-only/audit flow |
| `notifications` | Own ALL | Own only | Own only | End users can create/update their own notification records; no admin inbox |
| `carts`, `cart_items`, `wishlist_items`, `offers` | Own CRUD | No separate operational policy | No separate operational policy | Tables mostly unused by current checkout; cart is client state |
| `product_import_batches`, `product_import_rows` | None | None | ALL | Staging exists; no export/update mode |
| `admin_audit_logs` | None | None | SELECT only | Only import/publication currently log; no central audit writer |
| `shipping_methods`, `guest_checkout_rate_limits` | None | None | None | Service-role access only; no shipping admin UI |

The role enum has `CUSTOMER`, `SELLER`, `AUTHENTICATOR`, `STAFF`, `ADMIN`, `SUPER_ADMIN`. Helpers only expose `is_staff`, `is_admin`, and `is_authenticator`; there is no capability check. `has_role(user_id, role)` is a SECURITY DEFINER function and its invocation grants need review for role enumeration. The user-role table is not yet protected against privilege escalation by an ordinary ADMIN.

## Storage

Six buckets exist locally: public `avatars`, `brand-assets`, `editorial-assets`, `product-images`; private `consignment-media`, `authentication-evidence`. Public buckets have public-read object policy. Admin writes to public product/brand/editorial buckets. Owner-prefixed avatar and consignment uploads are allowed. Authentication evidence allows authenticator access. Policy SQL exists, but cross-role read/upload tests are not yet present; MIME, size, path and orphan cleanup must also be verified.

## Operations and quality gaps, in priority order

1. Close privacy and privilege-escalation RLS gaps, then implement capability-aware server authorization and auditable role management.
2. Preserve existing payment/checkout functions but add independent, safe payment reconciliation and a paid-but-unfulfillable queue. Never manually assert provider-paid status.
3. Add controlled order, consignment, authentication, and payout transitions backed by transactional functions and audit records. Existing STAFF `ALL` policies are not a sufficient state machine.
4. Build a dedicated admin shell and real data modules with URL-persisted server paging/filters; remove dashboard placeholders.
5. Expand product/variant/media/import/export workflows only where supported by the actual schema and image evidence.
6. Verify storage and RLS using anon, customer, specialist, admin, and service-role clients; add concurrency and regression tests.

Do not run `supabase db reset` against the current local volume until preserving its existing test/catalog data. A fresh disposable database or reviewed backup is required for the clean-migration quality gate.
