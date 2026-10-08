import Link from 'next/link';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { ReconcilePaymentButton } from '@/components/admin/ReconcilePaymentButton';
import { requireCapabilitiesPage } from '@/lib/admin/access';

const statuses = ['ALL', 'PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'REFUNDED'] as const;
const pageSize = 20;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/payments', ['payments.read']);
  const params = await searchParams;
  const status = statuses.find((item) => item === params.status) ?? 'ALL';
  const q = (params.q ?? '')
    .trim()
    .slice(0, 120)
    .replace(/[%_,()]/g, '');
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  let query = supabase
    .from('payments')
    .select(
      'id,order_id,provider,provider_reference,amount,currency,status,created_at,updated_at,paid_at,orders(order_number,guest_email)',
      { count: 'exact' }
    );
  if (status !== 'ALL') query = query.eq('status', status);
  if (q)
    query = /^[0-9a-f-]{36}$/i.test(q)
      ? query.or(`id.eq.${q},order_id.eq.${q}`)
      : query.ilike('provider_reference', `%${q}%`);
  const [{ data, count, error }, reconcilePermission] = await Promise.all([
    query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    supabase.rpc('has_capability', { check_capability: 'payments.reconcile' }),
  ]);
  if (error || reconcilePermission.error)
    throw new Error('Payment records are temporarily unavailable.');

  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Commerce / Payments
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.05em]">Money, verified.</h1>
          <p className="mt-2 text-sm text-[#61766b]">
            MineScope accepted a push request only when the provider confirms it. A pending payment
            is not a sale.
          </p>
        </div>
        {reconcilePermission.data && (
          <Link
            href="/admin/payments/reconciliation"
            className="rounded-full bg-[#0d211a] px-5 py-3 text-xs font-bold text-white hover:bg-[#16422c]"
          >
            Reconciliation queue →
          </Link>
        )}
      </div>
      <form
        method="get"
        className="mt-7 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e0e9e1] bg-white p-4"
      >
        <label className="text-xs font-bold text-[#61766b]">
          Reference / UUID
          <input
            name="q"
            defaultValue={q}
            placeholder="Provider ref or UUID"
            className="mt-1 block rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm text-[#173829]"
          />
        </label>
        <label className="text-xs font-bold text-[#61766b]">
          Status
          <select
            name="status"
            defaultValue={status}
            className="mt-1 block rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm text-[#173829]"
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white">
          Filter
        </button>
      </form>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e0e9e1] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                <th className="px-5 py-4">Payment / Order</th>
                <th className="px-4 py-4">Customer</th>
                <th className="px-4 py-4">Provider reference</th>
                <th className="px-4 py-4">Amount</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Created / Paid</th>
                <th className="px-4 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {data?.map((payment) => (
                <tr key={payment.id} className="align-top hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/payments/${payment.id}`}
                      className="font-mono text-xs text-[#126347] underline"
                    >
                      {payment.id.slice(0, 12)}
                    </Link>
                    <Link
                      href={`/admin/orders/${payment.order_id}`}
                      className="mt-1 block font-bold text-[#154b34] hover:underline"
                    >
                      {payment.orders?.order_number ?? 'Order'}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {payment.orders?.guest_email ?? 'Registered buyer'}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {payment.provider}
                    <br />
                    {payment.provider_reference ?? '—'}
                  </td>
                  <td className="px-4 py-4 font-bold tabular-nums">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: payment.currency,
                    }).format(payment.amount)}
                  </td>
                  <td className="px-4 py-4">{payment.status.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-4 text-xs text-[#61766b]">
                    {new Date(payment.created_at).toLocaleString('en-GB')}
                    {payment.paid_at && (
                      <p className="mt-1 font-bold text-[#126347]">
                        Paid {new Date(payment.paid_at).toLocaleString('en-GB')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {reconcilePermission.data &&
                    ['PENDING', 'REQUIRES_ACTION', 'FAILED'].includes(payment.status) ? (
                      <ReconcilePaymentButton paymentId={payment.id} />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="px-5 py-12 text-center text-sm text-[#61766b]">
            No payments match this status.
          </p>
        )}
        <AdminPagination
          basePath="/admin/payments"
          page={page}
          count={count ?? 0}
          pageSize={pageSize}
          filters={{ status, q }}
        />
      </div>
    </section>
  );
}
