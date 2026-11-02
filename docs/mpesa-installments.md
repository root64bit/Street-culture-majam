# M-Pesa installment payments

## Behavior

M-Pesa C2B requests are capped at **75,000 MZN per transaction**. Checkout splits a larger order into sequential requests and never sends the next prompt until the previous installment has been confirmed by MineScope.

Examples:

| Order total | M-Pesa requests                      |
| ----------: | ------------------------------------ |
|  75,000 MZN | 75,000 MZN                           |
|  75,001 MZN | 75,000 MZN + 1 MZN                   |
| 160,000 MZN | 75,000 MZN + 75,000 MZN + 10,000 MZN |

Every request has its own short alphanumeric `reference` and `thirdPartyRef`. A MineScope acceptance remains pending; only an `INS-0` status response with `transactionStatus: Completed` counts as received money.

The order is confirmed, its listings are sold, and seller payouts are created only when the sum of locally recorded, provider-confirmed installments exactly equals the order total. An overpayment is rejected as a reconciliation error.

## Failure and recovery

- Before any installment succeeds, a definite decline cancels the unpaid order and releases its inventory.
- After at least one installment succeeds, a later decline keeps the earlier money recorded and preserves the inventory reservation. The customer can retry only the remaining amount.
- A timeout or ambiguous provider response keeps the same payment reference active. Checkout and reconciliation query that reference rather than sending a duplicate push.
- Every successful partial installment extends the checkout hold by 30 minutes.
- If a partially paid hold expires, the expiry worker does not resell the item. It extends the hold for 24 hours and flags the successful payment records for operator review. Finance must complete the collection or arrange a verified reversal/refund; the system does not silently release partially paid inventory.

## Deployment

1. Apply `supabase/migrations/20261017090000_mpesa_installments.sql`.
2. Confirm the scheduled `/api/cron/payments` reconciliation job is authenticated with `CRON_SECRET`.
3. In the intended deployment only, set both `MPESA_PAYMENTS_ENABLED=true` and `NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED=true`.
4. Run a controlled merchant-approved test covering a decline, a timeout/status recovery, and a total above 75,000 MZN before opening checkout to customers.

The feature flags remain off in `.env.example` so a checkout cannot contact the live MineScope endpoint merely by cloning or building the repository.
