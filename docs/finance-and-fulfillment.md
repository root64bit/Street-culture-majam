# Finance and fulfillment implementation and release guide

Local implementation prepared on 19 October 2026. Finance reporting, private unit purchase costs, order presentation and evidence-backed manual fulfillment are implemented. Live Internet Express booking, collection scheduling and automatic tracking are not implemented or enabled. Production migrations and deployment require separate owner approval.

## What operators can use after an approved release

### Private purchase costs

Open **Products → product → Listings**. When adding a real store-owned unit, choose **Record private purchase cost**, or expand **Private purchase cost** on an existing available unit. Enter the actual per-unit purchase amount, currency, historical MZN conversion and invoice reference. Live listings do not need to be unpublished to change private costs. Reserved or sold units require an evidenced order-level finance correction instead.

These records are in separate finance-only tables, not `products`, `listings`, public catalog views or customer order payloads. ADMIN, SUPER_ADMIN and FINANCE have finance permissions. Other staff, customers and anonymous visitors cannot read purchase prices. Inventory creation still requires `inventory.manage`; supplying a private cost additionally requires `finance.manage`. Costed stock creation is one transaction, and editing checks the current revision to prevent overwriting another operator.

A missing cost is unknown, not zero. Enter zero only for a confirmed free item. Future order items capture private cost snapshots when created. Later cost edits do not rewrite an existing order. Historical orders have no invented cost backfill. Edits retain private revision history; general staff audit events contain only the revision, not its price.

### Profit and expenses

Open **Finance → Profit and expenses** and select the order creation dates. The report uses MZN and Johannesburg calendar dates. It is a management report for that order cohort using current refund state, not statutory period accounts or a bank reconciliation. Period overhead uses its incurred date. The date window is limited to 367 days and 2,000 orders; narrow larger reports.

| Measure                 | Calculation used                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Gross sales             | Merchandise subtotal plus customer delivery charge                                                                           |
| Net sales               | Gross sales less discounts and recorded full refunds                                                                         |
| Retained revenue        | Net sales less the consignor share and explicitly recorded sales tax                                                         |
| Cost of goods sold      | Frozen private costs for owned units; an evidenced manual order COGS total replaces that total rather than being added again |
| Gross profit            | Retained revenue less cost of goods sold                                                                                     |
| Order operating profit  | Gross profit less payment fees, actual courier costs, packaging, other direct costs and allocated transfer fees              |
| Period operating result | Sum of order operating results less recorded period overhead and period transfer fees                                        |
| Net result              | Period operating result less explicitly recorded income tax                                                                  |

Consignment merchandise revenue is the commission, not the full seller-owned sale proceeds. The remaining seller share is a liability; paying it does not create another expense. This report displays seller amounts still due from the existing payout records. It does not initiate payouts.

Record rent, software, salaries, advertising and other operating invoices as **OVERHEAD**, with an incurred date and reference. This version records individual expenses, not recurring payroll, automatic bill payment or bank feeds. Mark an invoice **PAID** or **DEDUCTED** only after obtaining external evidence. This changes the recorded unpaid balance, not profit a second time, and moves no money. It supports full recorded settlement only, not partial invoice allocations. Do not include the original purchase again in overhead when its unit cost already contributes to sold-item COGS.

Unknown costs, fees, ownership, historical FX or tax treatment leave results incomplete. Estimated inputs remain provisional. A zero overhead or tax total means none was recorded, not that none is owed. Full/partial refunds, returned stock, foreign seller payouts and FX gains/losses need finance review; automated return-cost allocation and statutory tax rules are outside this release.

Square fees come from the existing successful payment's read-only GetPayment result, not a percentage assumption or the difference between a payment and an available balance. Missing provider fee data remains unknown. Positive Square fee entries are costs and negative adjustments are credits. Fees in GBP use the frozen payment FX snapshot; manually entered foreign invoices require their historical MZN rate. Provider proceeds remain separately displayed in their original currency. [Square payment retrieval](https://developer.squareup.com/docs/payments-api/retrieve-payments), [processing fee object](https://developer.squareup.com/reference/square/objects/ProcessingFee).

The owner reported **GBP 6.88 available to transfer**, following a payment test. This is available cash, not verified net profit. It was not independently read from Square in this implementation run. The local environment lacked the production credentials needed for a fee lookup; no fee of GBP 0.35 has been assumed. No transfer was requested or performed. Square payout entries distinguish gross, fees and net amounts. [Square payout entries](https://developer.squareup.com/reference/square/objects/PayoutEntry).

### Manual fulfillment with evidence

1. A future canonical paid-and-confirmed courier order atomically receives one fulfillment review job and one confirmation-email intent. Repeated confirmation is deduplicated. Historical paid orders are not backfilled.
2. Check the order, financial holds, existing portal bookings, full recipient address and actual warehouse. Confirm any delivery amendment with the buyer. The paid address and checkout quote remain unchanged; the fulfillment amendment has its own revision and audit note.
3. Use **Start processing**, inspect and pack the goods, then **Mark packed**. Verify actual parcel count, weight and dimensions. Save both reviewed addresses and actual parcels. Changing these clears the prior approval.
4. An authorised booking approver records the maximum acceptable MZN courier cost. This is a spending limit, not another customer charge. The separate booking API remains disabled; obtain a fresh price and create any approved booking in the courier portal.
5. Import that existing booking's unique waybill, label/invoice evidence reference, actual courier charge and historical currency conversion. It must fit the approved limit. Recording it adds one courier cost to Finance. Confirm it was not already entered manually; finance flags multiple courier costs for review.
6. Booking or printing a label is not shipment. Record physical collection with an evidence reference before the order becomes shipped. Record delivery with delivery evidence before marking delivered. Pickup uses the existing separate pickup workflow.
7. An uncertain API result is held for reconciliation, never blindly retried. A previously accepted booking with a cost variance stays attached to the same provider reference while an authorised operator resolves the exception. Never make another booking merely to clear an exception.

Order **SCFA895534** is the owner's payment test. No fulfillment job was created for it in production and no booking was made in this run. Do not ship it without an explicit physical-shipment decision and a portal duplicate check. Its original ZA destination requires confirmation of the province before shipment; do not silently replace historical address data.

### Customer and consignment pages

Customer pages render full stored country/address details, distinguish accounting totals from the actual charged currency, format two decimals, show authorised receipt links, and suppress active dispatch promises on unpaid/cancelled/refunded orders. Timelines use explicitly labelled SAST timestamps. Account ownership or the existing hashed guest cookie is required before payment or shipment information is read; an order number is not access authority.

The light consignment form now uses dark text and visible controls. UK/half sizes remain available. Draft recovery is opt-in and scoped to the account on that device; it does not save credentials or photos. Condition/provenance notes are collected. Submitting is not authentication, publication or issuance of an insured prepaid label. Photo uploads, approved evidence checklists and the complete inbound label workflow remain separate work.

## Schema and safety controls

Apply these additive migrations in order only after the production release checks below:

- `20261019150000_finance_workspace.sql`: private expenses, reviews, full invoice-settlement evidence, manual cash observations and a restricted Square snapshot import.
- `20261019151000_fulfillment_workspace.sql`: jobs, event evidence, message outbox, future payment trigger, staff operations and serialized worker leases.
- `20261019152000_private_inventory_costs.sql`: private unit costs/history, frozen sale costs, atomic optional costed inventory creation and private report enrichment.

No new public cost columns or anonymous financial grants are added. Finance requires `finance.read`/`finance.manage`. Shipment preparation requires `shipping.prepare`; cost approval and recording a booking require `shipping.book`. Existing inventory, authentication and payment permissions are retained.

Shipment state is independent from payment/order state:

`REVIEW → READY → BOOKING_PENDING → BOOKED → AWAITING_COLLECTION → COLLECTED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`

`BOOKING_UNKNOWN` and `EXCEPTION` require investigation; `CANCELLED` is a separate terminal carrier fact. The current manual actions implement review, readiness, approval, imported booking, physical collection, delivery and exception resolution. Intermediate carrier statuses have display mappings but no live synchronization yet. A database unique order/group key prevents duplicate outbound jobs; a unique provider reference prevents importing one booking twice. Future split shipments and returns need explicit groups and workflows, not reuse of the outbound job.

The booking worker interface is exercised with mocks only. The actual Internet Express provider deliberately has `contractVerified: false`. Both `FULFILLMENT_API_BOOKING_ENABLED` and `ORDER_EMAILS_ENABLED` are off by default. `SC_EXTERNAL_SERVICES=disabled` independently blocks external services in isolated QA. No new cron schedule has been installed.

## Provider contract and remaining automation work

The rendered [Shiplogic API documentation](https://www.shiplogic.com/api-docs) was accessible. Its public contract documents shipment creation with addresses, contacts, parcels and service selection. A service-level ID from a rate revision may expire after five minutes, so the checkout quote cannot simply be reused days later. [Create a shipment](https://www.shiplogic.com/api-docs/post-create-a-shipment).

The shipment lookup page documents tracking-reference/ID and date/status filters; it does not establish a unique lookup or idempotency guarantee for our `customer_reference`. Account approval, credit, actual response envelopes, custom-reference permissions and whether booking also requests collection need confirmation with Internet Express. No guessed idempotency header or account capability was used. [Shipment lookup](https://www.shiplogic.com/api-docs/get-getting-shipments).

Authenticated tracking is documented, but the webhook page does not specify a signature-verification contract. Do not trust a public callback to change delivery or payment state; add authenticated verification/polling after confirming the account contract. Labels use provider-issued signed URLs with 24-hour expiry; private authorised storage/proxying and strict host checks must be completed before enabling document download. [Tracking](https://www.shiplogic.com/api-docs/get-tracking-a-shipment), [webhooks](https://www.shiplogic.com/api-docs/webhooks), [labels](https://www.shiplogic.com/api-docs/get-getting-shipment-label-%2F-waybill-pdf).

Remaining work before staff-approved API booking:

- Confirm the physical origin/contact, allowed routes, shipping windows, liability cover, prepaid/credit behavior and maximum cost variance. The footer/support address is not a warehouse default.
- Implement the account-verified provider transport and fresh booking quote/service validation. Verify a safe reconciliation path for a timeout after provider acceptance. Missing lookup results must never authorise an automatic second POST.
- Implement carrier-event ingestion, deduplication, out-of-order protection, bounded polling and last-success/stale alerts. Test the actual permitted response shape and any signed webhook mechanism.
- Add private label/POD retrieval, printing permissions, collection/cancellation and explicit return workflows. Current forms record document evidence references; they do not retrieve files.
- Replace standard checkout parcel assumptions with approved packaging profiles/consolidation. Actual booking measurements are recorded locally, but checkout still uses its existing standard parcel estimate.
- Extend queue search, assignment and task counts beyond the current state filter/oldest-100 view.
- Confirm the Vercel plan and scheduler cadence before registering workers. Email sends one queued message per invocation. Add provider status reconciliation for delivery/bounce events, which are not implemented here. Acceptance is never labelled inbox delivery. Define whether Street Culture or the courier sends each update to avoid duplication.

## Verification

All database migration rehearsals and mutations in this run used only the explicitly named disposable project `street_culture_sprint1_test` on ports 55321/55322. Production was not reset, migrated or seeded. The ordinary local Supabase project was not reset. Synthetic test users and orders, including mocked booking/delivery states, were removed from the dedicated disposable project after verification. They can be recreated with the isolated fixture script. The local preview server was stopped and temporary QA tabs closed.

- Standard suite: 192 passed, with isolated database tests skipped there.
- Dedicated isolated PostgreSQL suite: 72 passed. It includes 14 finance/fulfillment scenarios covering roles, privacy, duplicate intent/claim protection, unknown outcomes, holds, cost variance, invoice settlement, stale cost edits and frozen purchase costs.
- TypeScript, lint and the isolated production-mode build passed. Live provider operations were disabled during verification.
- Desktop/mobile browser checks confirmed readable consignment and finance views, no horizontal document overflow at a 390-pixel viewport, a successful private-cost update on a synthetic unit, and reload of stored parcel dimensions. The computer-use checks caught and corrected a local-only CSP connection issue; HTTP access to the exact disposable API is allowed only in development with external services disabled, never production.

Evidence is saved under ignored `outputs/order-shipping/`: `consignment-desktop.jpg`, `consignment-mobile.jpg`, `private-cost-editor.jpg`, `finance-desktop.jpg`, `finance-mobile.jpg`, and `fulfillment-queue.jpg`. All shown financial totals and customer records are synthetic.

## Production release and rollback

1. Review the existing dirty working tree and isolate the approved release files. Do not commit environment files, backups, synthetic fixtures, generated screenshots or unrelated earlier changes. Preserve the currently working Square 3DS policy and price/FX snapshots.
2. Obtain separate approval for the specific production migrations and deployment. Confirm a production database backup plus tested restore into an isolated database and record the known-good Vercel deployment. The clean schema rehearsal in this run does not replace a rehearsal against a fresh production backup.
3. Review the three draft migrations against the current production schema and other pending migration files. Rehearse on the restored backup, verify row counts/roles/grants and check the actual deployment diff. Do not run a blind `db push` against every pending file.
4. Apply the approved migrations before code deployment. Deploy initially with booking and order emails disabled, and without new schedules. Verify access denial for customers/ordinary staff, cost privacy, order ownership, historical order preservation, currency/address rendering, and Square 3DS CSP headers.
5. Enable transactional email only after sender configuration, recipient preferences and provider outcome reconciliation are approved; use an explicitly authorised test recipient. No historical message backfill is performed by these migrations.
6. Do not enable the booking flag with the current adapter. After the remaining provider work and a separately approved controlled live test, enable staff-approved booking for approved routes first. Rules-based unattended booking is a later opt-in release.

For an incident, disable new worker activity first, stop its schedules and investigate provider references before any retry. Return to the recorded known-good Vercel deployment if needed. Keep the additive database tables and all finance/shipment evidence; do not roll back by deleting paid orders or dropping evidence tables. Reconcile uncertain courier/email results manually. Schema changes that interfere with the prior release require a reviewed forward fix, not a destructive production reset.

No production deployment, booking, collection, cancellation, refund, customer message, payout or transfer was performed in this implementation run.
