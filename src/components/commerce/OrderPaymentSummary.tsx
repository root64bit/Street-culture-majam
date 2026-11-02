import { privateOrderAccess } from '@/lib/commerce/private-order';
import { formatOrderMoney, safeSquareReceiptUrl } from '@/lib/commerce/order-money';

export async function OrderPaymentSummary({ orderId }: { orderId: string }) {
  const access = await privateOrderAccess(orderId);
  if (!access) return null;
  const { data: payments } = await access.admin
    .from('payments')
    .select('id,provider,amount,currency,paid_at,provider_payload')
    .eq('order_id', orderId)
    .eq('status', 'SUCCEEDED');
  if (!payments?.length) return null;
  return (
    <section className="mt-5 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
      <h2 className="font-bold">Payment history</h2>
      {payments.map((payment) => {
        const payload =
          payment.provider_payload &&
          typeof payment.provider_payload === 'object' &&
          !Array.isArray(payment.provider_payload)
            ? payment.provider_payload
            : {};
        const square =
          payload.square && typeof payload.square === 'object' && !Array.isArray(payload.square)
            ? payload.square
            : {};
        const receipt = safeSquareReceiptUrl(square.receiptUrl);
        return (
          <p className="mt-2" key={payment.id}>
            {payment.provider === 'square' ? 'Square card / Apple Pay' : payment.provider}:{' '}
            <strong>{formatOrderMoney(Number(payment.amount), payment.currency)}</strong>
            {payment.paid_at && (
              <>
                {' '}
                ·{' '}
                {new Date(payment.paid_at).toLocaleString('en-GB', {
                  timeZone: 'Africa/Johannesburg',
                })}{' '}
                SAST
              </>
            )}
            {receipt && (
              <a
                className="ml-3 font-semibold underline"
                href={receipt}
                target="_blank"
                rel="noopener noreferrer"
              >
                Square receipt
              </a>
            )}
          </p>
        );
      })}
      <p className="mt-2 text-xs text-neutral-600">
        The order accounting total and the amount charged by your payment provider can use different
        currencies. This is not an additional charge.
      </p>
    </section>
  );
}
