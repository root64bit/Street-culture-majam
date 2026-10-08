# STREET CULTURE — Admin & Backend Final Report

Date: 8 October 2026  
Repository: `root64bit/Street-culture-majam` (`codex/commerce-admin-deployment`)  
Supabase Project: `tysibniisuobzpmnhwkf`

---

## 1. Audit

### What Existed at Baseline
- Next.js 15.5.26 + React 19 + Supabase SSR storefront with a working MZN guest/member checkout (`create_guest_checkout_order`), server-only MineScope M-Pesa client, and a security-invoker `public_catalog_listings` view.
- A minimal 4-route admin surface (`/admin`, `/admin/products`, `/admin/products/new`, `/admin/imports`) wrapped inside storefront chrome (`SiteChrome`), with decorative dashboard placeholders and no dedicated layout, sidebar, search, pagination, or operational queues.
- 28 public tables with RLS enabled, but critical policy gaps:
  - `profiles` and `seller_profiles` allowed public `SELECT` of all rows and columns.
  - `orders`, `seller_payouts`, and `commission_rules` granted broad `STAFF` `ALL` write access, bypassing state machines, finance permissions, and audit trails.
  - `user_roles` allowed any `ADMIN` to grant or revoke `SUPER_ADMIN` without audit.
  - `shipping_methods` had no RLS policy and no admin UI.

### What Was Missing
- Dedicated admin shell, capability-filtered navigation, command search (`Ctrl/Cmd + K`), and operational notification inbox.
- Granular role/capability model (`OPERATIONS_MANAGER`, `CATALOG_MANAGER`, `AUTHENTICATOR`, `FULFILLMENT`, `FINANCE`, `SUPPORT`) enforced consistently across pages, API routes, and SQL RPCs.
- Complete product workspace (Variants, Media, Listings, Pricing, SEO, History), size-range generator, bulk actions, and `.xlsx` catalog export.
- Operational modules and audited state machines for Inventory, Orders, Payments & Reconciliation, Consignments, Authentication, Sellers, Customers, Payouts, Commissions, Brands, Categories, Media Library, Shipping, Reports, Staff & Roles, Settings, and Audit Logs.

### What Was Fixed & Implemented
- Added 27 new PostgreSQL migrations (`20261006120000_operational_roles.sql` through `20261006172000_payout_recovery_and_settings_consumers.sql`), bringing the schema to 47 migrations.
- Closed all privacy and privilege-escalation RLS gaps (`profiles`, `seller_profiles`, `orders`, `seller_payouts`, `commission_rules`, `user_roles`, `products`, `product_variants`).
- Built a dedicated responsive `AdminShell` (`src/components/admin/AdminShell.tsx`) separated from storefront chrome (`src/components/layout/SiteChrome.tsx`). Removed `/admin/loading.tsx` to eliminate Next.js 15 / React 19 streaming duplicate heading nodes during initial route transitions.
- Implemented all 20 admin operational modules backed by real Supabase queries, URL-persisted filters, server-side pagination, Zod input validation, structured error responses (`src/lib/admin/errors.ts`), and audited `SECURITY DEFINER` PostgreSQL RPCs.
- Built the homepage horizontal Most Wanted editorial carousel (`src/components/storefront/EditorialProductCarousel.tsx`) with autoplay, manual controls, quick buy, wishlist, touch swipe, and `prefers-reduced-motion` support.

---

## 2. Database

### Schema Summary (Verified on Primary Local DB & Clean Disposable Rebuild `street_culture_admin_rebuild_20261006`)
- **Public Tables**: 36 (36 with Row Level Security enabled — 100%)
- **Public Views**: 1 (`public_catalog_listings` with `security_invoker = true`)
- **Public Functions / RPCs**: 75
- **User Triggers**: 56
- **Public Indexes**: 92 (including composite operational indexes on `products(slug, brand_id, category_id, archived_at)`, `listings(status, product_id)`, `orders(user_id, status, payment_status, fulfillment_status, created_at)`, `payments(order_id, provider_reference, status, last_reconciled_at)`, `consignment_submissions(seller_id, status)`, `authentication_records(status, assigned_to, created_at)`, `seller_payouts(status, seller_id)`, `notifications(user_id, created_at)`, and `product_import_batches(created_at)`).

### Table-by-Table RLS Report

| Table | RLS | Anon Read | Authenticated Own Read | Operator Read | Operator Write | Enforcement Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `account_operator_notes` | Yes | No | No | `customers.read` / `sellers.read` | Via `add_account_operator_note` RPC | Never visible to the subject customer/seller |
| `admin_audit_logs` | Yes | No | No | `audit.read` | Append-only via `SECURITY DEFINER` RPCs | No direct client `INSERT`/`UPDATE`/`DELETE` |
| `admin_notification_receipts` | Yes | No | Own (`user_id = auth.uid()`) | Own | Via `mark_admin_notifications_read` RPC | Per-operator read state |
| `admin_operational_notifications` | Yes | No | No | `notifications.read` + `required_capability` | Trigger `emit_admin_operational_notification` | Scoped to operator's capabilities |
| `authentication_evidence` | Yes | No | No | `authentication.review` | Via `attach_authentication_evidence` RPC | Private bucket object reference |
| `authentication_records` | Yes | No | Seller via consignment | `authentication.review` | Via `save_authentication_inspection` & `decide_consignment_authentication` RPCs | Checklist guard trigger before `PASSED` |
| `brands` | Yes | Active only | Active only | `brands.manage` | `brands.manage` (`save_admin_configuration`) | Slug uniqueness & sort order |
| `cart_items` | Yes | No | Own cart | No | Own cart | Unused by localStorage checkout; RLS-safe |
| `carts` | Yes | No | Own (`user_id = auth.uid()`) | No | Own | Unused by localStorage checkout; RLS-safe |
| `categories` | Yes | Active only | Active only | `categories.manage` | `categories.manage` (`save_admin_configuration`) | Hierarchy cycle check in RPC |
| `commission_rules` | Yes | Active only | Active only | `commissions.manage` / `payouts.read` | Via `save_admin_configuration` (`commissions.manage`) | Direct `STAFF` write removed |
| `consignment_media` | Yes | No | Own submission | `consignments.read` / `authentication.review` | Seller draft `INSERT` | Private `consignment-media` bucket |
| `consignment_submissions` | Yes | No | Own (`seller_id = auth.uid()`) | `consignments.read` / `authentication.review` | Seller draft/submit; operators via `transition_consignment` & `record_consignment_return` | Protected by `protect_seller_consignment_fields` trigger |
| `guest_checkout_rate_limits` | Yes | No | No | No | `service_role` / checkout RPC only | Internal rate-limiting table |
| `listings` | Yes | `LIVE` + `PASSED` + `MZN` + `qty=1` | Own (`seller_id = auth.uid()`) | `inventory.read` / `products.read` | Seller draft edit; operators via `create_staff_inventory_draft`, `create_consignment_listing`, `manage_inventory_listing`, `publish_authenticated_unit` | Protected by `guard_listing_commercial_state` trigger |
| `notifications` | Yes | No | Own (`user_id = auth.uid()`) | Own | Own `UPDATE` (read state) + system triggers | Seller consignment/payout alerts |
| `offers` | Yes | No | Buyer own / Seller listing | No | Buyer own | Unused by current storefront; RLS-safe |
| `order_events` | Yes | No | Order owner | `orders.read` | Via order/payment/fulfillment RPCs | Customer-safe timeline events |
| `order_items` | Yes | No | Order owner | `orders.read` | Via `create_guest_checkout_order` RPC | Snapshots unit price & 30% commission |
| `order_operator_notes` | Yes | No | No | `orders.read` | Via `operate_order` (`ADD_NOTE`) RPC | Hidden from customer order timeline |
| `order_refund_requests` | Yes | No | No | `orders.read` / `payments.read` | Via `operate_order` (`REQUEST_REFUND`) & `review_order_refund` (`payouts.mark_paid`) | Finance attestation required for `REFUNDED` |
| `orders` | Yes | No | Owner (`user_id = auth.uid()`) | `orders.read` | Via `create_guest_checkout_order`, `transition_order_fulfillment`, `operate_order`, `review_order_refund` | Direct `STAFF` write removed |
| `payments` | Yes | No | Order owner | `payments.read` | Service-role initiation + `record_provider_reconciliation` & `resolve_payment_review_flag` | No arbitrary manual "mark paid" path |
| `product_import_batches` | Yes | No | No | `products.import` | `products.import` | Tracks batch status & counts |
| `product_import_rows` | Yes | No | No | `products.import` | `products.import` + `commit_product_import_row` RPC | Staged rows validated before commit |
| `product_media` | Yes | Active products | Active products | `products.read` / `media.manage` | `products.write` / `media.manage` | Primary image & live-stock removal protection |
| `product_variants` | Yes | Active products | Active products | `products.read` | `products.write` (`INSERT`/`UPDATE`), `generate_product_size_range` | `DELETE` revoked; `guard_variant_deactivation` trigger |
| `products` | Yes | Active unarchived | Active unarchived | `products.read` | `products.write` (`INSERT`/`UPDATE`), `admin_bulk_update_products`, `save_product_workspace_metadata` | `DELETE` revoked; `guard_product_publication` trigger |
| `profiles` | Yes | No | Own (`id = auth.uid()`) | `customers.read` / `sellers.read` / `staff.manage` | Own non-privileged fields; operators via `set_account_operational_status` & `set_staff_admin_access` | Public profile leak closed; `protect_profile_privileged_fields` trigger |
| `role_capabilities` | Yes | No | Staff read | Staff read | Migration-managed | Defines role-to-capability matrix |
| `seller_payouts` | Yes | No | Own (`seller_id = auth.uid()`) | `payouts.read` | Trigger on paid consignment sale + `transition_seller_payout` RPC | Direct `STAFF` write removed; `protect_seller_payout_snapshot` trigger |
| `seller_profiles` | Yes | No | Own (`user_id = auth.uid()`) | `sellers.read` / `consignments.read` / `payouts.read` | Own profile fields; operators via `set_seller_verification` RPC | Public financial leak closed; `protect_seller_profile_fields` trigger |
| `shipping_methods` | Yes | Active only | Active only | `shipping.manage` | Via `save_admin_configuration` (`shipping.manage`) | Consumed dynamically at checkout |
| `store_settings` | Yes | Non-secret via `operational_store_context()` | Non-secret via `operational_store_context()` | `settings.manage` / `dashboard.read` | Via `save_admin_configuration` (`settings.manage`) | Rejects secret keys; consumed by dashboard, auth checklist, notifications, and consignment return instructions |
| `user_roles` | Yes | No | Own (`user_id = auth.uid()`) | `staff.manage` | `SUPER_ADMIN` only via `manage_staff_role` RPC | Prevents privilege escalation and last-superadmin removal |
| `wishlist_items` | Yes | No | Own (`user_id = auth.uid()`) | Count via `admin_account_directory` | Own (`ALL`) | Synced with authenticated customer wishlist |

---

## 3. Admin Modules

| Route | Module | Status | Key Capabilities & Operational Features |
| --- | --- | --- | --- |
| `/admin` | Dashboard | **COMPLETE** | `dashboard.read` — Revenue today/month, orders today/pending, paid-requires-review, failed/stale payments, live/reserved/sold/draft/low-stock listings, pending consignments, auth queue, pending payouts, import issues, attention links. |
| `/admin/products` | Products List | **COMPLETE** | `products.read`, `products.write`, `products.archive`, `products.export` — Search, brand/category/status/stock/featured/most-wanted filters, sorting, pagination, bulk actions, `.xlsx` export (all/filtered/selected). |
| `/admin/products/new` | Create Product | **COMPLETE** | `products.write` — Creates unpublished catalog draft (`active = false`) with optional initial `DRAFT`/`PENDING` own-stock unit and photography. |
| `/admin/products/[id]` | Product Workspace | **COMPLETE** | 7 tabs (`general`, `variants`, `media`, `listings`, `pricing`, `seo`, `history`), size-range generator, media ordering/primary/alt text, stock activation/price adjustment, audit history. |
| `/admin/inventory` | Inventory & Listings | **COMPLETE** | `inventory.read`, `inventory.manage` — Filter by status/ownership/condition/search, activate, deactivate, archive, restore, adjust price, release expired unpaid reservations. |
| `/admin/orders` | Orders List | **COMPLETE** | `orders.read` — `admin_order_workspace` search (order #, email, phone, payment ref), status/payment/fulfillment/provider/date filters, pagination. |
| `/admin/orders/[id]` | Order Detail | **COMPLETE** | `orders.read`, `orders.fulfill`, `orders.manage`, `payouts.mark_paid` — Fulfillment state transitions (`PACKED`, `READY_FOR_PICKUP`, `SHIPPED`, `DELIVERED`), private operator notes, unpaid cancellation, refund request & finance external refund attestation. |
| `/admin/payments` | Payments List | **COMPLETE** | `payments.read`, `payments.reconcile` — Search by reference/UUID, filter by status, link to reconciliation queue and payment detail. |
| `/admin/payments/[id]` | Payment Detail | **COMPLETE** | `payments.read`, `payments.reconcile` — Redacted provider metadata, mismatch banner, audited provider check, review flag resolution (`resolve_payment_review_flag`). |
| `/admin/payments/reconciliation` | Reconciliation Queue | **COMPLETE** | `payments.read`, `payments.reconcile` — Lists stale `PENDING`/`REQUIRES_ACTION` (>15m) and `reconciliation_needs_review` payments for audited MineScope verification. |
| `/admin/consignments` | Consignments List | **COMPLETE** | `consignments.read` — Search by brand/product/UUID, filter by status, server pagination. |
| `/admin/consignments/[id]` | Consignment Detail | **COMPLETE** | `consignments.read`, `consignments.review`, `inventory.manage` — Signed private media gallery, intake/receipt transitions, canonical variant matching & listing creation, return handling with store return instructions. |
| `/admin/authentication` | Authentication Queue | **COMPLETE** | `authentication.review` — Filter by status and priority (`LOW`, `NORMAL`, `HIGH`, `URGENT`), displays assigned reviewer and submission link. |
| `/admin/authentication/[id]` | Authentication Detail | **COMPLETE** | `authentication.review` — Configurable inspection checklist, serial/style review, comparison notes, assignment claim, private `authentication-evidence` upload, audited `START`/`PASS`/`FAIL`/`REQUEST_INFO` decisions. |
| `/admin/sellers` & `/admin/sellers/[id]` | Sellers | **COMPLETE** | `sellers.read`, `users.manage` — Directory with active/sold listings, gross sales, pending/paid payouts, verification status (`set_seller_verification`), account status, private notes, audit history. |
| `/admin/customers` & `/admin/customers/[id]` | Customers | **COMPLETE** | `customers.read`, `users.manage` — Directory with orders count, MZN lifetime spend, wishlist count, last order, account status (`set_account_operational_status`), private support notes. |
| `/admin/payouts` | Payouts | **COMPLETE** | `payouts.read`, `payouts.approve`, `payouts.mark_paid` — Search by payment reference or seller/payout UUID, filter by status, approve, mark processing, mark paid (with method & reference), mark failed, and re-approve failed payouts. |
| `/admin/commissions` | Commission Rules | **COMPLETE** | `commissions.manage` — Create/edit rules (seller type, brand, category, %, fixed/min fee, priority, active dates) + live MZN commission calculator preview. |
| `/admin/brands` | Brands | **COMPLETE** | `brands.manage` — Create/edit brand name, slug, description, logo path, sort order, featured, active status, and product count. |
| `/admin/categories` | Categories | **COMPLETE** | `categories.manage` — Create/edit hierarchical categories (`parent_id` with cycle validation), slug, image path, sort order, active status. |
| `/admin/media` | Media Library | **COMPLETE** | `media.manage` — Browse/search/upload across `product-images`, `brand-assets`, `editorial-assets`; inspect product/brand/category usage; copy storage path; delete only unused assets. |
| `/admin/imports` & `/admin/imports/[id]` | Bulk Import | **COMPLETE** | `products.import` — Dynamic `.xlsx` template download, upload & dry-run validation, batch history, row-level preview with suggested fixes, error workbook download, transactional commit. |
| `/admin/shipping` | Shipping Methods | **COMPLETE** | `shipping.manage` — Create/edit delivery & pickup methods (`code`, `name`, `country_code`, `region`, `price`, `estimated_min_days`, `estimated_max_days`, `active`). |
| `/admin/reports` | Reports | **COMPLETE** | `reports.read` — 7 SQL-backed operational reports (`sales`, `orders`, `products`, `inventory`, `consignment`, `payouts`, `payment_failures`) with date/currency/brand/category/seller filters and CSV download. |
| `/admin/notifications` | Operational Inbox | **COMPLETE** | `notifications.read` — Capability-scoped operational alerts with unread filter and per-operator mark-read (`mark_admin_notifications_read`). |
| `/admin/staff` | Staff & Roles | **COMPLETE** | `staff.manage` (`SUPER_ADMIN`) — Lists staff accounts, roles, capabilities, last activity, and admin access status; audited role grant/revoke and admin access disable/enable. |
| `/admin/settings` | Settings | **COMPLETE** | `settings.manage` — Manages non-secret `store`, `consignment`, `authentication`, and `notifications` settings and displays read-only environment status for Supabase and MineScope M-Pesa. |
| `/admin/audit` | Audit Log | **COMPLETE** | `audit.read` — Filterable by action, entity type, actor, and search text; paginated history of all administrative mutations. |

---

## 4. Roles & Capabilities

### Role Hierarchy & Capability Matrix
- **`SUPER_ADMIN`**: All 32 capabilities, including `staff.manage` and `settings.manage`.
- **`ADMIN`**: All operational capabilities except `staff.manage` (cannot assign/remove roles or revoke `SUPER_ADMIN`).
- **`OPERATIONS_MANAGER`**: Dashboard, products/inventory read & manage, orders read/fulfill/manage, payments read/reconcile, consignments read/review, sellers/customers read & manage, shipping manage, reports read, notifications read, audit read.
- **`CATALOG_MANAGER`**: `dashboard.read`, `products.read`, `products.write`, `products.publish`, `products.archive`, `products.import`, `products.export`, `inventory.read`, `inventory.manage`, `brands.manage`, `categories.manage`, `media.manage`, `notifications.read`.
- **`AUTHENTICATOR`**: `dashboard.read`, `consignments.read`, `authentication.review`, `notifications.read`.
- **`FULFILLMENT`**: `dashboard.read`, `inventory.read`, `orders.read`, `orders.fulfill`, `shipping.manage`, `notifications.read`.
- **`FINANCE`**: `dashboard.read`, `orders.read`, `payments.read`, `payments.reconcile`, `payouts.read`, `payouts.approve`, `payouts.mark_paid`, `commissions.manage`, `sellers.read`, `reports.read`, `audit.read`, `notifications.read`.
- **`SUPPORT`**: `dashboard.read`, `orders.read`, `orders.manage`, `payments.read`, `consignments.read`, `customers.read`, `sellers.read`, `notifications.read`.
- **`STAFF`**: Read-only baseline (`dashboard.read`, `products.read`, `inventory.read`, `orders.read`, `consignments.read`, `notifications.read`).

### Enforcement Layers
1. **Middleware (`src/middleware.ts`)**: Requires authenticated session for `/admin/*` and `/account/*`.
2. **Server Page Guard (`requireCapabilitiesPage` in `src/lib/admin/access.ts`)**: Verifies active profile (`account_status = 'ACTIVE'` and `admin_access_disabled = false`) and required capability via `my_capabilities()`.
3. **API Route Guard (`capabilityApiClient` in `src/lib/admin/access.ts`)**: Rejects unauthorized mutations with HTTP 401/403 before executing business logic.
4. **Database RLS & `SECURITY DEFINER` RPCs**: Every table policy and mutation function independently checks `public.has_capability(...)` inside PostgreSQL.

---

## 5. Commerce Logic

- **Inventory & Reservations**: Each sellable unit is a distinct `listings` row (`quantity = 1`, `currency = 'MZN'`). `create_guest_checkout_order` locks requested listings `FOR UPDATE`, verifies `status = 'LIVE'`, `authentication_status = 'PASSED'`, and exact `expected_price`, then sets `status = 'RESERVED'` with a 15-minute `reservation_expires_at`.
- **Payments & Reconciliation**:
  - Checkout initiates an M-Pesa push via MineScope (`src/lib/payments/mpesa.ts`). Accepted push requests remain `PENDING` (`order_payment_status_enum = 'PENDING'`).
  - Only verified provider confirmation (`PAID`) triggers `complete_guest_checkout_payment`, which marks the listing `SOLD`, transitions the order to `CONFIRMED`/`PAID`, and creates a `seller_payouts` row if and only if `ownership_type = 'CONSIGNMENT'`.
  - If a reservation was already released before a late provider `PAID` confirmation arrives, `complete_guest_checkout_payment` keeps `payment_status = 'PAID'` and `orders.status = 'CANCELLED'` and flags `reconciliation_needs_review = true` so operators can process a verified refund rather than double-selling inventory.
  - Scheduled reconciliation (`/api/cron/payments`, protected by `CRON_SECRET`) and manual reconciliation (`/api/admin/payments/[id]/reconcile`) query MineScope and record audited results via `record_provider_reconciliation`.
- **Fulfillment & Refunds**:
  - Paid orders progress through `transition_order_fulfillment`: `UNFULFILLED -> PROCESSING -> PACKED -> SHIPPED -> DELIVERED` (or `READY_FOR_PICKUP -> PICKED_UP` for Maputo pickup).
  - Unpaid orders can be cancelled via `operate_order('CANCEL_UNPAID')`, releasing any active reservation.
  - Refund requests (`operate_order('REQUEST_REFUND')`) are reviewed by Finance via `review_order_refund` (`START_REVIEW`, `APPROVE_EXTERNAL_REFUND`, `RECORD_REFUND` with external reference, or `REJECT`).

---

## 6. Consignment Logic

1. **Submission**: Sellers submit items in MZN via `/consign/new` (`status = 'SUBMITTED'`).
2. **Intake & Receipt (`transition_consignment`)**:
   - `SUBMITTED -> UNDER_REVIEW` (`START_REVIEW`)
   - `UNDER_REVIEW -> MORE_INFORMATION_REQUIRED` (`REQUEST_INFO`) or `APPROVED_FOR_DELIVERY` (`APPROVE`) or `REJECTED` (`REJECT`)
   - Seller can respond to `MORE_INFORMATION_REQUIRED` via `respond_to_consignment_info_request`, returning the item to `UNDER_REVIEW`.
   - `APPROVED_FOR_DELIVERY -> AWAITING_ITEM -> RECEIVED` (`MARK_RECEIVED`)
   - `RECEIVED -> AUTHENTICATION_PENDING` (`SEND_TO_AUTH`), which creates a `PENDING` `authentication_records` row.
3. **Human Authentication (`save_authentication_inspection`, `attach_authentication_evidence`, `decide_consignment_authentication`)**:
   - Reviewer records checklist items, serial/style review, comparison notes, and private photos/PDFs in `authentication-evidence`.
   - `PENDING -> IN_REVIEW` (`START`) -> `PASSED` (`PASS`, requiring all recorded checklist items true and confirmed condition) or `FAILED` (`FAIL`) or `MORE_INFORMATION_REQUIRED` (`REQUEST_INFO`).
4. **Canonical Listing Creation (`create_consignment_listing`)**:
   - From `AUTHENTICATED`, `PHOTOGRAPHY`, or `PRICING`, an operator with `inventory.manage` binds the consignment to an active `product_variants` row of matching size and compatible size system, creating a `CONSIGNMENT` listing (`authentication_status = 'PASSED'`, `DRAFT` or `LIVE`) and moving the consignment to `LISTED` when published.
5. **Sale & Settlement (`transition_seller_payout`)**:
   - When a consignment listing sells, `complete_guest_checkout_payment` snapshots the 30% platform commission (`commission_amount = 30%`, `net_amount = 70%`), creates one `PENDING` `seller_payouts` row, and sets the consignment to `SOLD`.
   - Finance transitions the payout: `PENDING -> APPROVED -> PROCESSING -> PAID` (or `FAILED`, with recovery path `FAILED -> APPROVED`). Marking `PAID` requires a payment method and unique reference and transitions the consignment to `PAID`.
6. **Return Handling (`record_consignment_return`)**:
   - Items in `REJECTED` or `AUTHENTICATION_FAILED` can transition to `RETURN_REQUESTED -> RETURNED`. Return instructions configured in `/admin/settings` (`operational_store_context()`) are shown to both operators and the seller.

---

## 7. Bulk Import & Export

- **Template (`/api/admin/imports/template`)**: Generates a 5-sheet `.xlsx` workbook via ExcelJS (`PRODUCTS`, `VARIANTS`, `MEDIA`, `INSTRUCTIONS`, `REFERENCE VALUES`) with frozen headers/reference columns and live taxonomy reference values.
- **Canonical Media Contract**: `MEDIA` sheet uses `product_reference`, `image_url`, `sort_order`, `alt_text` (legacy wide `image_1..image_5` sheets remain accepted for backward compatibility).
- **Staging & Validation (`/api/admin/imports`)**: Parses `.xlsx`, validates all fields and taxonomy references, checks duplicate references/SKUs in-file and in-DB, and stages rows into `product_import_batches` and `product_import_rows` (`supports dryRun`).
- **Preview & Error Workbook (`/admin/imports/[id]`, `/api/admin/imports/[id]/errors`)**: Shows summary metrics, filterable row preview with field-level errors and suggested fixes, and downloadable `.xlsx` error report.
- **Transactional Commit (`/api/admin/imports/[id]/commit`)**: Commits each valid product group via `commit_product_import_row` inside a PostgreSQL transaction as unpublished own-stock (`products.active = false`, `listings.status = 'DRAFT'`, `authentication_status = 'PENDING'`, `currency = 'MZN'`, `quantity = 1`).
- **Catalog Export (`/api/admin/products/export`)**: Exports all, filtered, or selected products into a 3-sheet `.xlsx` workbook (`PRODUCTS`, `VARIANTS`, `LISTINGS`) audited under `PRODUCT_EXPORT_XLSX`.

---

## 8. Security

- **Row Level Security**: Enabled on all 36 public tables; verified across anonymous, customer, seller, authenticator, catalog manager, finance, admin, and superadmin clients in `tests/integration/supabase/capabilities.test.ts` and `tests/integration/supabase/operational-admin.test.ts`.
- **Storage Buckets**:
  - Public buckets (`product-images`, `brand-assets`, `editorial-assets`, `avatars`): public read; write restricted by capability (`media.manage` / `products.write` / `brands.manage` / owner avatar prefix); referenced public assets are protected from deletion by `public_asset_is_unused`.
  - Private buckets (`consignment-media`, `authentication-evidence`): `public = false`; anonymous and unrelated customer downloads/signed URLs are denied by RLS; accessed only via short-lived (300s) server-generated signed URLs for authorized operators/owners.
- **Secret Redaction**: Payment metadata is sanitized on the server via `redactPaymentMetadata` (`src/lib/admin/redaction.ts`) before rendering in `/admin/payments/[id]`. Settings RPC `save_admin_configuration` rejects any payload key matching `secret|token|password|key|private|authorization|credential`.

---

## 9. Test Results

All quality gates were executed and passed on 8 October 2026:

| Quality Gate | Command | Result |
| --- | --- | --- |
| **Clean DB Migration Rebuild** | `pnpm dlx supabase@2.118.0 db reset --local --workdir tmp/admin-rebuild` | **PASSED** (47 migrations + `seed.sql` applied cleanly from empty DB) |
| **Supabase DB Schema Lint** | `pnpm dlx supabase@2.118.0 db lint --local` | **PASSED** (`No schema errors found`, 0 warnings) |
| **Transactional Import SQL Test** | `Get-Content -Raw tests/integration/supabase/import-transaction.sql \| docker exec -i supabase_db_street_culture psql ...` | **PASSED** (`commit_product_import_row` + trigger guard verified and rolled back cleanly) |
| **TypeScript Type Generation & Check** | `pnpm db:types && pnpm typecheck` | **PASSED** (0 errors) |
| **ESLint** | `pnpm lint` | **PASSED** (`No ESLint warnings or errors`) |
| **Vitest Unit & DB Integration Suite** | `pnpm test` | **PASSED** — **12 test files, 57/57 tests passed** (commerce concurrency, 30% commission snapshot, capability/privacy RLS, operational admin workflows, payout failure recovery, import parser/validator, catalog export) |
| **Next.js Production Build** | `pnpm build` | **PASSED** (all storefront, account, admin, and API routes compiled cleanly with normal payment configuration) |
| **Playwright End-to-End Suite** | `pnpm test:e2e --workers=1` | **PASSED** — **15/15 E2E tests passed** (`admin-import.spec.ts`, 13 tests in `smoke.spec.ts`, and comprehensive 20-module workflow in `z-admin-operations.spec.ts`) |

---

## 10. Remaining Blockers & Production Operational Notes

There are **no code or schema blockers**. The following operational boundaries are intentional and documented:
1. **Live M-Pesa Charging**: No dedicated staging MineScope endpoint/test phone was supplied; live M-Pesa charges were never initiated during verification. Production M-Pesa remains controlled by environment configuration (`MPESA_PAYMENTS_ENABLED` / `NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED` and MineScope credentials).
2. **Scheduled Reconciliation Secret (`CRON_SECRET`)**: The `/api/cron/payments` endpoint requires `Authorization: Bearer <CRON_SECRET>` in production (configured in `vercel.json` / Vercel environment variables).
3. **External Notification Delivery**: In-app customer notifications and the admin operational inbox are fully database-backed; external email/SMS delivery remains a development logger until a transactional email/SMS provider is selected.
