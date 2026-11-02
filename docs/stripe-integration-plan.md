# Street Culture Stripe integration plan

## Confirmed business and payment policy

Street Culture is the retailer selling clothing, accessories and shoe-cleaning products directly to customers. The owner confirmed a United Kingdom business registration, shipping from South Africa to supported international destinations, and no current VAT registration. Company registration is not a tax registration.

Only Stripe and M-Pesa are intended for new checkout. Square and PayFast, including the former PayFast Sandbox tool, are retired. Historical payments, orders, receipts and finance records must remain intact. Do not automatically refund, retry, cancel or migrate an existing payment.

The Stripe plugin and official best-practices fallback are installed. The requested `stripe_implementation_planner` tool was not exposed in this chat after connection, so this plan uses Stripe's official integration guidance rather than claiming to be planner-generated. No Stripe API credentials were present in the project's local environment files during review. Stripe account capabilities, tax settings and API delivery have not been verified.

## Current release scope

The provider policy blocks new Square quotes/payments and PayFast Sandbox activity even if a stale environment flag is enabled. Checkout retains M-Pesa and displays Stripe as unavailable while configuration is pending. This release does not implement or activate Stripe payment processing, change database schema, alter product prices, or enable tax collection.

## Proposed Stripe payment path

1. Use Stripe-hosted Checkout Sessions for one-time retail orders, with dynamic payment methods. Do not promise Apple Pay or another wallet on every device; Stripe determines eligible methods. Stripe Connect is not required for the seller model the owner described. Existing internal consignor accounting remains separate from Stripe payouts.
2. Keep the existing catalog and order price authority on the server. Validate real inventory, selected size, customer ownership and a current delivery quote before reserving. Never trust prices, currency, customer identity or success states supplied by the browser.
3. Confirm charge currency before implementation. The catalog currently uses MZN and the former card flow used a frozen GBP quote. A GBP Stripe quote is a proposal, not a price change: the customer must see and approve the exact GBP charge before redirecting. Verify any desired MZN presentment against the actual Stripe account and payment-method support first. Keep the catalog/order total separate from the payment/settlement currency and record FX evidence.
4. Reserve inventory transactionally and create one active Stripe attempt per order with a stable idempotency key. Persist expected amount, currency, account, environment and order/payment IDs before requesting a Checkout Session. Resolve uncertain creation by the same idempotency key; do not create a second session blindly. Block switching to Stripe while an M-Pesa attempt or partial payment is unresolved, and vice versa.
5. Store the Checkout Session and PaymentIntent identifiers privately. Choose session expiry and inventory hold durations together: Stripe Checkout's expiry rules must not outlast an unprotected item reservation. Cancellation/expiration handling must check the actual provider outcome before releasing stock.
6. Fulfill through a signed webhook handler, never from the success redirect. Verify the raw-body signature, environment, owning Stripe account, metadata, expected amount and currency. Handle `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and session expiration. Only confirmed paid money can trigger local completion. Deduplicate events and tolerate retries and out-of-order delivery.
7. Add a service-only, serialized Stripe completion transaction. It must use the existing inventory locks and hold protections, create the sale/consignor accounting only once, and route late payments or inventory mismatches to review rather than falsely promising delivery. Do not invoke M-Pesa or Square completion functions for Stripe records.
8. Reuse the transactional customer/admin email outbox only after canonical payment confirmation. Keep courier booking separately controlled. A redirect or email acceptance is not proof of payment or delivery.

## Required application changes

- Add the current pinned Stripe Node SDK, a server-only client instance and a sandbox-first configuration validator. Use separate local-development and CI sandboxes. Prefer a narrowly restricted application API key; never reuse an MCP OAuth token as an application secret.
- Add authenticated session creation/status APIs, a raw-body webhook endpoint, and a private return-page state that can show pending confirmation without falsely marking an order paid.
- Extend the order-creation provider gate, payment database gate, attempt uniqueness, reconciliation worker, admin filters and typed database definitions. A text `provider` column alone is not a complete gateway integration.
- Correct provider labels in customer/admin emails, receipts and payment summaries. Existing non-Square branches currently assume M-Pesa. Preserve old Square evidence and do not backfill/re-send old notifications.
- Add actual Stripe fee and settlement evidence to finance reporting. Preserve gross charge, refunds, fees, settlement net and FX separately. Unknown fees or costs remain incomplete, never assumed zero; available payout balance is not business profit.
- Configure only supported shipping destinations and courier services from the real South African warehouse. Do not infer its street address from the marketing footer or a previous test order. Worldwide intent is not a guarantee that every destination or shoe-cleaning product is courier-eligible.

## Tax boundary

Leave Stripe automatic tax collection disabled and create no registrations. The owner has not confirmed registration with a tax authority. Recording a registration in Stripe changes collection behavior but does not itself register the business with that authority.

Before future activation, review the existing Tax Settings without overwriting them, confirm the actual goods ship-from address, obtain owner-confirmed registrations and product tax-code choices, and run sandbox calculations. Check taxability reasons, not just whether a nonzero amount appears. Clothing, accessories and cleaning products may require different codes; do not invent codes or apply a digital-services code. Import VAT, customs duties, South African obligations and delivery terms need a qualified tax/shipping review; this plan does not determine legal obligations or promise duties-paid delivery.

## Test and deployment gates

- Sandbox only until account identity/capabilities, restricted credentials and webhook ownership are verified. Never test live payments using friends' real cards.
- Test successful and declined payments, 3DS/SCA, supported wallets, asynchronous methods, wrong signatures, wrong account/environment, amount/currency mismatch, replayed/out-of-order events, provider outages, timeouts, parallel checkout, partial M-Pesa crossover, late payment and expired inventory.
- Verify customer/private order access, correct provider/currency on receipts and emails, admin notification deduplication, finance fee reconciliation and untouched historical orders.
- Rehearse each additive database migration against a verified restorable backup in an isolated database. Use a scoped application release because the working tree contains unrelated pending work.
- Deploy a sandbox-only verification path before enabling customer Stripe checkout. No real charge, refund, email test or courier booking is part of deployment verification without explicit approval.
- Keep production Stripe off until end-to-end sandbox verification passes and the owner approves the reviewed live configuration. M-Pesa remains independent. If Stripe is disabled later, preserve pending-payment reconciliation and all historical records.

## Official references

- [Stripe Checkout](https://docs.stripe.com/payments/checkout)
- [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Webhooks](https://docs.stripe.com/webhooks)
- [Sandbox isolation](https://docs.stripe.com/sandboxes)
- [API key security](https://docs.stripe.com/keys-best-practices)
- [Currencies and settlement](https://docs.stripe.com/currencies)
- [Stripe Tax setup](https://docs.stripe.com/tax/set-up)
- [Tax registrations](https://docs.stripe.com/tax/registering)
- [Testing Stripe Tax](https://docs.stripe.com/tax/testing)
