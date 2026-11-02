# Street Culture order emails and courier workflow

Street Culture keeps payment, messages and shipping separate. A verified payment records the sale and queues customer and admin emails. It does not book a courier, request collection or mean the parcel has shipped.

## What the customer and admin receive

Future orders created after each channel's activation cutoff receive an order confirmation after canonical payment confirmation. The buyer receives item details, the order total, actual payment currency, delivery address and a private order link. A separate purchase alert goes to support@streetculturevault.com with a link to the admin order and the next fulfillment steps. Authentication and newsletter mail continue through their existing integrations.

Customer shipped and delivered emails follow evidence-backed order transitions. A booking or printed label must not trigger a shipped email. Messages never contain card data, inventory cost prices or profit calculations. The guest order link does not grant access by itself: the buyer needs their original checkout browser or the account used to purchase.

Open **Admin → Order emails and alerts** to inspect channel activation, the last worker run and the latest 50 messages. QUEUED means a message intent exists, ACCEPTED means Twilio accepted the request, and DELIVERED requires provider delivery evidence. UNDELIVERED, FAILED and UNKNOWN need operator review. Delivery means acceptance by the receiving mail system, not a guarantee that the message appears in the inbox.

## Courier procedure

1. Payment confirmation creates a fulfillment review job for a courier order. Pickup orders stay separate.
2. Staff confirm the recipient address and the actual collection warehouse, check the item, pack it and record the parcel's dimensions and weight.
3. Staff review a fresh courier quote and approve the maximum courier cost. The amount already paid by the customer remains unchanged.
4. Once the merchant-specific Internet Express contract and permissions are verified, an approved API booking can create a shipment and retrieve its label. Until that adapter is connected, staff use the courier portal and import verified booking evidence into the fulfillment workspace.
5. Staff print and attach the label, arrange collection separately where required, and record actual handover evidence. Only then does the order become shipped.
6. Authenticated tracking lookup or verified carrier events update transit and delivery. The carrier contract must be connected before automatic tracking can run; manual evidence-backed updates remain available.

The collection warehouse address and contact must be confirmed explicitly. The marketing postal address is not automatically the warehouse. The payment-test order SCFA895534 is excluded from new automation and must not be shipped without explicit approval. Check for a manually created courier booking before creating another one.

## WhatsApp recommendation

Keep +27 66 548 8223 as normal manual support for now. Automated WhatsApp is not connected or activated, and no checkout checkbox promises it. Buying a product is not WhatsApp consent.

To add automatic confirmations later, first approve business sender registration, the sender number, a dedicated messaging credential and utility templates. Add a separate unchecked order-update consent field, save its version and normalized international number atomically with checkout, and implement opt-out handling before enabling the channel. The migration reserves a disabled WhatsApp channel; it is not a working sender or a marketing audience.

Twilio charges a WhatsApp platform fee and applicable Meta template fees. Use email for automated updates and manual WhatsApp for support while volume is low. See [Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing) and [sender and template requirements](https://www.twilio.com/docs/whatsapp/api).

## Email marketing procedure

Customers subscribe through the separate newsletter checkbox and confirm their email. Account registration, purchases and transactional emails do not subscribe them. An unsubscribe stops marketing without blocking necessary order updates.

In **Admin → Email marketing**, save a draft subject and message, review its audience and content, then explicitly approve sending. The existing tool sends bounded batches to confirmed subscribers and rechecks consent immediately before each send. Continue approved batches until the campaign finishes. There is no automatic campaign schedule and no campaign was sent as part of this release.

Use support@streetculturevault.com as the sender and the configured physical mailing address in the footer. Do not infer WhatsApp campaign permission from email newsletter consent. WhatsApp campaigns need separate consent, approved marketing templates and a separately approved audience and budget.

Suggested first campaign draft: introduce the store's authenticity checks, link to the current collection and invite subscribers to contact support. Approve the final wording and audience before sending; do not invent a discount or delivery promise.

## Scheduling and reliability

`ORDER_EMAILS_ENABLED` is the server-side kill switch. Each private database channel also has an enabled flag and activation cutoff. Both must permit sending. Old orders and queued historical messages are excluded by order creation time. No existing order is backfilled.

Supabase Cron calls `wake_order_notifications()` every minute. It only contacts the fixed production worker URL when eligible work or a delivery-status lookup is due. A dedicated worker secret is stored in Supabase Vault and a sensitive Vercel production environment variable, never in browser code or cron SQL text. The existing inventory-release and payment-reconciliation schedules are unchanged. This avoids upgrading the Vercel Hobby plan for minute-level cron scheduling; platform usage and email sends still consume the existing service allowances.

The worker claims messages with database leases and event-based deduplication. It processes at most three customer emails and three admin alerts per run, plus bounded receipt lookups. A timeout or expired send lease becomes UNKNOWN, never an automatic resend. Provider receipt GET requests may retry with backoff because they do not create another email. Twilio operation records expire after seven days; unresolved receipts move to review before that deadline. See [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions) and [Twilio operation receipts](https://www.twilio.com/docs/email/api/reference/email-operation-resource).

If an email is uncertain, check its provider operation and order in Twilio before deciding whether a manual resend is safe. Never reset UNKNOWN to QUEUED casually. A failed notification must not undo payment, release stock, create a second shipment or initiate a refund.

## Release and rollback

Customer order emails and admin purchase alerts were activated on 19 October 2026 at 17:51 SAST for orders created after activation. Production deployment `dpl_Je6hTFC4qTXpEkKC2SaQV5LvJuM3` serves the changes. The database has 63 migrations; WhatsApp and API courier booking remain off. The minute-level notification cron completed successfully, and the authenticated live worker completed against an empty queue without sending messages.

Verification passed: 202 standard tests, 79 isolated database tests, type checking, lint, production build and 12 public live smoke checks. The notification tests use mocked email responses. A read-only lookup confirmed the existing restricted key can read an individual Twilio operation and that an earlier authentication email was delivered; no new order-email delivery test has been sent.

The guarded release helper is `scripts/order-communications-release.mjs`. Its stages are `inspect`, `backup`, `rehearse`, `apply approved-future-order-emails`, `verify`, `configure-worker`, deployment, `check-worker`, and `activate approved-future-order-emails`. The approved action is future customer order emails and admin purchase alerts only. The helper refuses historical enrollment, unexpected migrations, overwritten backups and a live worker check against a nonempty queue.

Keep deployment and backup evidence in the ignored `outputs/order-communications-release/20261019` directory. Its database dump contains private data and must not enter GitHub or Vercel. The backup covers database schemas and records, not storage-object bytes. Validate the live worker with an empty queue; a real email test still needs separate owner approval.

To stop new email sends immediately, disable CUSTOMER_EMAIL and ADMIN_EMAIL in `order_notification_channels`; do not change their cutoffs. Disable the named `street-culture-order-notifications` cron job if a complete worker stop is needed. Set `ORDER_EMAILS_ENABLED=false` for the next deployment. An already accepted provider message or in-flight send may still complete. Keep outbox records for reconciliation.

Rollback the Vercel deployment to the previous known-good release with outbound notifications disabled. Preserve the additive schema, immutable orders and delivery records; do not restore an old production backup over new sales or re-enable the legacy unleased email claim. Keep the existing Square verification policy and payment cron unchanged.

The previous known-good deployment is `dpl_GVHzNQG949hDhdkAooRM2xxsFj7n`. The temporary restored rehearsal database was removed after release, while the verified private backup was retained.
