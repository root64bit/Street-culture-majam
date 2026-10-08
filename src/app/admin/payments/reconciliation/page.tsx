import Link from 'next/link';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { ReconcilePaymentButton } from '@/components/admin/ReconcilePaymentButton';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { pageNumber } from '@/lib/admin/filters';
const queues = {
  review: 'Flagged / provider mismatches',
  stale: 'Stale pending requests',
  failed: 'Failed attempts',
  paid_conflict: 'Paid / cancelled order conflicts',
};
export default async function PaymentReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; page?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/payments/reconciliation', [
    'payments.reconcile',
  ]);
  const params = await searchParams;
  const queue =
    params.queue && params.queue in queues ? (params.queue as keyof typeof queues) : 'review';
  const page = pageNumber(params.page);
  const size = 30;
  let query = supabase
    .from('payments')
    .select(
      'id,order_id,provider_reference,status,amount,currency,created_at,last_reconciled_at,last_provider_status,reconciliation_needs_review,orders!inner(order_number,payment_status,status)',
      { count: 'exact' }
    );
  if (queue === 'review') query = query.eq('reconciliation_needs_review', true);
  if (queue === 'stale')
    query = query
      .in('status', ['PENDING', 'REQUIRES_ACTION'])
      .lt('created_at', new Date(Date.now() - 15 * 60000).toISOString());
  if (queue === 'failed') query = query.eq('status', 'FAILED');
  if (queue === 'paid_conflict')
    query = query.eq('status', 'SUCCEEDED').eq('orders.status', 'CANCELLED');
  const { data, count, error } = await query
    .order('created_at', { ascending: true })
    .range((page - 1) * size, page * size - 1);
  if (error) throw new Error('Reconciliation queue unavailable.');
  return (
    <section className="p-4 sm:p-7 lg:p-10">
      <Link href="/admin/payments" className="text-xs font-bold text-[#126347]">
        ← All payments
      </Link>
      <h1 className="mt-5 text-3xl font-black">Reconcile with evidence.</h1>
      <p className="mt-2 max-w-3xl text-sm text-[#61766b]">
        Provider checks never initiate a new charge. Pending is not paid. A paid transaction that
        lost its reservation stays flagged instead of reselling stock. No arbitrary mark-paid action
        is available.
      </p>
      <form className="my-6 flex gap-3">
        <label className="text-xs font-bold">
          Queue
          <select name="queue" defaultValue={queue} className="ml-2 rounded-lg border p-2">
            {Object.entries(queues).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-lg border px-4 text-xs font-bold">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#f0f5ef] text-xs uppercase">
            <tr>
              {[
                'Order / payment',
                'Local state',
                'Provider state',
                'Last checked',
                'Amount',
                'Action',
              ].map((label) => (
                <th className="p-4" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.map((payment) => (
              <tr key={payment.id} className="border-t align-top">
                <td className="p-4">
                  <Link
                    className="font-bold text-[#126347]"
                    href={`/admin/orders/${payment.order_id}`}
                  >
                    {payment.orders?.order_number}
                  </Link>
                  <Link
                    className="mt-2 block font-mono text-xs underline"
                    href={`/admin/payments/${payment.id}`}
                  >
                    {payment.provider_reference ?? payment.id}
                  </Link>
                </td>
                <td className="p-4">
                  {payment.status}
                  <p className="text-xs text-[#61766b]">
                    Order: {payment.orders?.payment_status} / {payment.orders?.status}
                  </p>
                </td>
                <td className="p-4">
                  {payment.last_provider_status ?? 'Not checked'}
                  {payment.reconciliation_needs_review && (
                    <p className="mt-1 text-xs font-bold text-amber-800">REVIEW REQUIRED</p>
                  )}
                </td>
                <td className="p-4 text-xs">
                  {payment.last_reconciled_at
                    ? new Date(payment.last_reconciled_at).toLocaleString('en-GB')
                    : 'Never'}
                </td>
                <td className="p-4">
                  {payment.amount.toLocaleString()} {payment.currency}
                </td>
                <td className="p-4">
                  <ReconcilePaymentButton paymentId={payment.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && (
          <p className="p-8 text-sm text-[#61766b]">No transactions in this queue.</p>
        )}
        <AdminPagination
          basePath="/admin/payments/reconciliation"
          page={page}
          count={count ?? 0}
          pageSize={size}
          filters={{ queue }}
        />
      </div>
    </section>
  );
}
