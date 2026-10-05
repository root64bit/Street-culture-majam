# STREET CULTURE commerce lifecycle report

Status: local implementation and automated checks are complete; controlled production launch is **not yet verified**. Real MineScope staging and approved delivery rates remain open.

## Catalog

The homepage, MOST WANTED horizontal carousel, category/brand/search pages, and product detail pages read Supabase products, variants, listings, media, brands, and categories through a typed catalog service. The public security-invoker view returns only authenticated, active, one-of-one LIVE MZN listings. RLS also hides APPROVED/unpublished inventory from anonymous readers and prevents sellers from self-publishing or self-authenticating drafts. The local seed provides seven sample sellable listings; production inventory must be loaded separately. The supplied horizontal logo is used in the header and the SC icon in the footer/browser tab.

Wishlist buttons use a small server route instead of bundling the browser Supabase client into the storefront. Guest saves persist only in local storage and merge into the signed-in account on successful sign-in. The optimized homepage first-load JavaScript is 128 kB in the local build.

The staff-only `/admin/products` workspace creates inactive MZN product drafts, permits brand/category additions and direct storage photo uploads, and shows real database counts instead of placeholders. Staff may also record one-of-one own-stock inventory drafts through a transactional RPC; these remain unpublished with authentication pending. The user-provided product folder was inspected but not imported. See `docs/catalog-admin-guide.md`.

## Cart

Cart lines identify the exact `listing_id`, include display snapshots, and persist in browser storage. The cart validates listing availability, size, and current database price before checkout. Sold, reserved, missing, or repriced listings require customer action and are never silently substituted.

## Checkout

Guest and signed-in customers use the same server-priced checkout. Signed-in orders retain `user_id` and appear in account order history. Guest orders use a high-entropy checkout secret whose hash is stored in the database; the HttpOnly cookie authorizes payment polling and order lookup. Contact and delivery details and the chosen shipping method are snapshotted. The server selects only active shipping methods for the MZ province and computes subtotal, shipping, and total. No delivery method is active until the merchant supplies approved rates.

## Reservation

The service-role-only checkout RPC locks listing rows in a deterministic order and atomically creates the order, order items, and 15-minute reservation. Supabase Cron calls the expiry RPC every minute. Expiry cancels unpaid orders and releases their listings but does not release paid reservations. A local PostgreSQL integration test launched two simultaneous buyers against one listing and observed exactly one success, one conflict, and one owning order.

## Payments

MineScope M-Pesa initiation and status calls run only on the server. A push-request acceptance is **not** payment success. The server marks a payment PAID only after a trusted MineScope status response (`INS-0` and `Completed`), then atomically confirms the order and sells the listing. Provider reference and idempotency keys have unique indexes; an ambiguous network/5xx/unreadable initiation response stays pending under the same reference, rather than releasing inventory or sending a second push. Definite failure cancels the order and releases inventory. Payment initiation is rate-limited. Real MineScope staging has **not** been exercised; all Playwright success/failure responses were mocked. Both M-Pesa feature flags remain off by default.

## Orders

The database currently uses order states `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED`; payment states `UNPAID`, `AUTHORIZED`, `PAID`, `FAILED`, `REFUNDED`. These remain separate from fulfillment. Signed-in order history and detail pages read through owner RLS. Guest lookup at `/order/[orderNumber]` requires the valid HttpOnly guest token or the signed-in owner; order number alone does not grant access. Paid-after-expiry orders remain flagged for manual review, never falsely shown as fulfillable.

## Fulfillment

The existing fulfillment states are `UNFULFILLED`, `IN_AUTHENTICATION`, `PACKED`, `SHIPPED`, `DELIVERED`, `RETURNED`. Database order events record creation, reservation, payment initiation/confirmation/failure, listing sale, payout creation, expiry, and staff-updated processing/packed/shipped/delivered transitions. Customer timelines use readable labels. A real carrier integration and operating procedure for marking shipments remain to be configured.

## Consignment

On a confirmed consignment sale, the listing becomes SOLD and the related submission becomes SOLD. A payout obligation is PENDING, not paid. Only an actual payout status change to PAID moves the submission to PAID. The consignor dashboard and detail timeline display customer-facing statuses; the public consignment page now shows the approved 30%/70% split instead of obsolete USD tiers.

## Commission

The approved active MZN rule retains **30% per consigned item** for STREET CULTURE, with zero fixed/minimum fee. The checkout transaction snapshots the selected rule, commission amount, and seller net on each order item. A 1,000 MZN test item creates a 300 MZN platform share and a 700 MZN seller obligation. Later rule changes do not alter the sale snapshot.

## Seller payouts

Trusted payment completion creates at most one pending payout for each eligible external-seller order item. Own stock creates no seller payout. The account payouts page totals real pending and paid MZN obligations, with no fabricated balance.

## Notifications

A server-only notification provider interface covers order, payment, shipping, consignment, and payout events. No email/SMS vendor is configured. The development provider logs event intent only and reports `delivered: false`; it does not claim a customer was contacted.

## Tests

- Local Supabase status, clean `db reset`, migration/seed application, and generated database types: passed.
- `pnpm lint`: passed with no ESLint warnings or errors (Next's `next lint` deprecation notice remains).
- `pnpm typecheck`: passed.
- `pnpm test` (Vitest with two thread workers): **27 passed** across 7 files, including 8 local PostgreSQL commerce integration tests and the inventory-draft amount validation.
- `pnpm build`: passed with local Supabase keys and `NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED=true` for the browser-test build only.
- `pnpm test:e2e`: **11 passed** in Chromium using local Supabase; provider status was mocked, not sent to MineScope. Guest wishlist persistence, staff-only catalog and own-stock inventory draft creation, photo upload, and mobile layouts at 390, 430, and 768px were checked, including 430px checkout.
- The supplied logo was visually checked at 390px and 1440px.

## Known blockers

1. The merchant must approve supported MZ delivery methods, province coverage, MZN prices, and estimates. Until then, `shipping_methods` intentionally has no active production row and real checkout cannot complete.
2. A dedicated staging M-Pesa number and confirmed MineScope staging endpoint/account are needed for a real push, decline, status, and reconciliation test. No live or staging customer payment was initiated here.
3. Production Supabase migrations, catalog/media, shipping rows, environment flags, and operator procedures have not been deployed/verified. A real notification provider is not configured. Do not enable customer payments or claim launch readiness from mocked browser tests.

The Git checkpoint and deployment are deferred until the remaining real-payment and operational gates are satisfied. No secret or local environment file should be committed.
