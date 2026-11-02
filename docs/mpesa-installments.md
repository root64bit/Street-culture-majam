# M-Pesa installment payments

## Behavior

New payments use the signed YAKA-owned gateway, following `YAKA_MPesa_New_Server_API_Guide.pdf` revision 1.0 (2 November 2026). Street Culture retains its **75,000 MZN per transaction** cap. Checkout splits a larger order into sequential requests and never sends the next prompt until the previous installment has been confirmed by the official status query. The guide's amount syntax does not promise higher wallet or merchant limits.

Examples:

| Order total | M-Pesa requests                      |
| ----------: | ------------------------------------ |
|  75,000 MZN | 75,000 MZN                           |
|  75,001 MZN | 75,000 MZN + 1 MZN                   |
| 160,000 MZN | 75,000 MZN + 75,000 MZN + 10,000 MZN |

Every attempt has a stable `SCMP` reference unique to Street Culture, an exact decimal amount string (for example `"627.85"`), and a persisted four-field request before any debit is submitted. Every HTTP request gets a fresh nonce and an HMAC-SHA256 v2 signature over the method, path, timestamp, nonce and exact transmitted JSON. Redirects are rejected. Acceptance, including `INS-0` on initiation, remains pending. Only a successful HTTP status in the expected production environment, `data.success === true`, `data.responseCode === "INS-0"` and a normalized `Completed` status counts as received money.

The deployed gateway has one merchant configuration, shortcode **903480**. Caller requests cannot select another merchant or destination account. The shared gateway secret is not the Vodacom API key and must be provisioned privately by the gateway operator. No provider API key or RSA credential is needed in Street Culture.

The order is confirmed, its listings are sold, and seller payouts are created only when the sum of locally recorded, provider-confirmed installments exactly equals the order total. An overpayment is rejected as a reconciliation error.

## Failure and recovery

- Before any installment succeeds, a definite decline cancels the unpaid order and releases its inventory.
- After at least one installment succeeds, a later decline keeps the earlier money recorded and preserves the inventory reservation. The customer can retry only the remaining amount.
- A timeout or ambiguous provider response keeps the same payment reference active. Checkout and reconciliation query that reference rather than sending a duplicate push.
- The **Check payment status** action calls only the authenticated status endpoint, never initiation. If the initiation response was lost, status recovery can find the newest M-Pesa payment belonging to that checkout; it still works after the inventory reservation expires.
- A provider HTTP 5xx, malformed/mismatched response, reference conflict, network failure or failed database write after submission leaves the attempt unresolved. Checkout keeps another push blocked. Readiness must confirm both `ok` and `liveChargesArmed` before creating a new attempt. Readiness does not certify current Vodacom availability.
- Historical `STxxxxxxxx` MineScope attempts retain status-only reconciliation against their original endpoint. They are never resubmitted to YAKA. A missing transaction at the new gateway is never evidence that an older payment failed. New initiation has no MineScope fallback.
- Disabling new M-Pesa payments does not disable status lookups or the reconciliation scheduler. Signed YAKA status still needs its existing shared credential. Legacy status uses the original provider and does not need that new credential.
- Every successful partial installment extends the checkout hold by 30 minutes.
- If a partially paid hold expires, the expiry worker does not resell the item. It extends the hold for 24 hours and flags the successful payment records for operator review. Finance must complete the collection or arrange a verified reversal/refund; the system does not silently release partially paid inventory.

## Deployment

1. Verify the existing guest checkout, installment and centavos migrations are present. This gateway change requires no schema migration; existing unique provider-reference and one-open-M-Pesa-per-order indexes protect concurrent submissions.
2. Confirm the scheduled `/api/cron/payments` reconciliation job is authenticated with `CRON_SECRET`.
3. Provision `MPESA_GATEWAY_SHARED_SECRET` as a server-only secret, plus the exact origin, expected host and `production` environment shown in `.env.example`. The secret must match the existing gateway; do not generate an unrelated replacement or rotate it independently. The application uses a default 20-second request timeout, constrained to 1-60 seconds to fit its route and reconciliation deadlines.
4. Run public `/health` and signed `/v1/readiness` checks without a debit. Validate malformed responses, signature construction, duplicate references, timeouts and pending-to-completed transitions with mocked transport. In the intended deployment only, enable both M-Pesa flags after authenticated readiness passes.
5. A real-wallet end-to-end test needs explicit merchant authorization. It was not submitted as part of implementing this change. No refund, payout or customer webhook endpoint is exposed by this gateway.

The feature flags remain off in `.env.example` so a checkout cannot submit live payments merely by cloning or building the repository.
