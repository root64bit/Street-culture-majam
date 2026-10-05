# One-page commerce and checkout report

Historical report from the previous implementation pass. The current verified state and remaining launch blockers are in [commerce-lifecycle-report.md](commerce-lifecycle-report.md).

## Homepage and shopping experience

- Replaced the dark archival landing page with a warm, photography-led one-page storefront.
- Added a floating glass header, trust strip, product discovery, inline category filtering, new arrivals, featured edit, authentication steps, consignment call to action, confidence statements and FAQ accordion.
- Added original local campaign and product imagery under `public/images/`.
- Added sample product cards with mobile-first Quick Buy, required size selection, wishlist toggles, and an in-page bag drawer.
- The MOST WANTED section is a horizontal, touch-scrollable carousel with category filters and desktop arrow controls. It renders the full live listing set (not just the first few products).
- Added guest contact and delivery steps, MZN display, Maputo delivery estimate, payment choice, and a sticky checkout control.
- Existing product/category routes remain in place.

## Cart and checkout

- Cart state lives in a root `CommerceProvider`, wrapping the header, page content, footer and overlays.
- Cart supports quantities, removal, subtotal display and empty-cart state.
- Checkout collects guest contact and delivery fields without forcing account creation.
- Dialogs support Escape, focus return and tab trapping; the cart and checkout use a bottom sheet on small screens.
- The homepage reads all active MZN live listings from Supabase and falls back to an explicitly labelled sample preview when none are available. Preview items cannot be purchased.

## Payments and order processing

- Added a provider-neutral gateway interface and fail-closed MineScope M-Pesa and Square adapters.
- Guest checkout creates a server-priced order, atomically reserves one-off inventory, and stores the guest access token only as a hash. HttpOnly cookies authorize the order's payment/status routes.
- M-Pesa requests go server-to-server through the MineScope middle server documented in the supplied API PDF. A push-request acceptance remains pending; only a successful status response marked `INS-0` and `Completed` is treated as paid. Status checks do not send duplicate payment pushes.
- The MineScope URL is pinned to its documented HTTPS host and path; the server integration is feature-flagged off by default. No real request or payment has been sent.
- Square stays disabled by default. Card payment must only be enabled for a legitimate merchant account in a Square-supported seller country ([Square supported seller regions](https://developer.squareup.com/docs/international-development)). The Web Payments SDK and server charge adapter are not wired.
- No browser-side payment success simulation is used. Checkout never shows an order confirmation without a trusted server confirmation.
- Added payment idempotency fields and indexes, provider payload storage, failed timestamp, listing hold expiry, guest-order/rate-limit storage, and service-role-only order/payment RPCs in new migrations.
- MineScope's supplied documentation does not define a signed callback contract, so this integration polls its status endpoint. Automated background reconciliation, refunds, delivery fulfillment, payout obligations, and production operations are not included.

## Tests and validation

- `pnpm typecheck` passed after the current checkout and carousel changes.
- Tests and end-to-end flows have not been run in this implementation pass.
- MineScope sandbox/live validation has not been run; no payment request has been sent through the merchant account.

## Known limitations and production requirements

- Payment flags remain off in the environment template. Apply both new Supabase migrations, configure production Supabase, confirm active live MZN listings and delivery operations, then enable both `MPESA_PAYMENTS_ENABLED` and `NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED` only in the intended environment.
- The feature is built against MineScope's documented request/status contract but has not been validated against the merchant's live MineScope account. Do not infer production readiness from the UI or from a successful push request; test authorized end-to-end flows before launch.
- Set up a trusted scheduled worker for `release_expired_listing_reservations()` and operational reconciliation before relying on reserved stock or unattended payments.
- Square's official Web Payments SDK, Payments API, webhook signature verification and supported-country merchant validation still need implementation and sandbox verification.
- Configure real production merchant credentials only in server-side environment settings. Never populate secret variables with values beginning `NEXT_PUBLIC_`.
