import { AdminPagination } from '@/components/admin/AdminPagination';
import { PayoutActions } from '@/components/admin/PayoutActions';
import { requireCapabilitiesPage } from '@/lib/admin/access';

const statuses = [
  'ALL',
  'PENDING',
  'APPROVED',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED',
] as const;
const pageSize = 20;

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/payouts', ['payouts.read']);
  const params = await searchParams;
  const status = statuses.find((item) => item === params.status) ?? 'ALL';
  const q = params.q?.trim() ?? '';
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  let query = supabase
    .from('seller_payouts')
    .select(
      'id,seller_id,order_item_id,listing_id,gross_amount,commission_amount,adjustments,net_amount,currency,status,created_at,processed_at,payment_method,payment_reference,order_items(product_name_snapshot,order_id,orders(order_number))',
      { count: 'exact' }
    );
  if (status !== 'ALL') query = query.eq('status', status);
  if (q) {
    const safeQ = q.replaceAll(',', ' ');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeQ);
    query = isUuid
      ? query.or(`id.eq.${safeQ},seller_id.eq.${safeQ},payment_reference.ilike.%${safeQ}%`)
      : query.ilike('payment_reference', `%${safeQ}%`);
  }
  const [records, approve, paid] = await Promise.all([
    query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    supabase.rpc('has_capability', { check_capability: 'payouts.approve' }),
    supabase.rpc('has_capability', { check_capability: 'payouts.mark_paid' }),
  ]);
  if (records.error || approve.error || paid.error)
    throw new Error('Payout records are temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Finance / Seller settlements
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Payouts, controlled.</h1>
      <p className="mt-2 max-w-3xl text-sm text-[#61766b]">
        Each payout is tied to an eligible sold order item. Gross, commission and seller net are
        immutable snapshots. Recording an external payment requires a reference and finance
        permission.
      </p>
      <form
        method="get"
        className="mt-7 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e0e9e1] bg-white p-4"
      >
        <label className="min-w-60 flex-1 text-xs font-bold text-[#61766b]">
          Search reference or seller/payout UUID
          <input
            name="q"
            defaultValue={q}
            placeholder="Payment reference or UUID"
            className="mt-1 w-full rounded-lg border border-[#dce6dc] px-3 py-2 text-sm text-[#173829]"
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
                {item}
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
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                <th className="px-5 py-4">Seller / Item</th>
                <th className="px-4 py-4">Order</th>
                <th className="px-4 py-4">Gross</th>
                <th className="px-4 py-4">Commission</th>
                <th className="px-4 py-4">Net</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Created / Processed</th>
                <th className="px-4 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {records.data?.map((payout) => (
                <tr key={payout.id} className="align-top hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4">
                    <p className="font-bold">
                      {payout.order_items?.product_name_snapshot ?? 'Seller item'}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[#718278]">
                      Seller {payout.seller_id.slice(0, 8)} · Payout {payout.id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-4 font-bold">
                    {payout.order_items?.orders?.order_number ?? '—'}
                  </td>
                  <td className="px-4 py-4 tabular-nums">{payout.gross_amount}</td>
                  <td className="px-4 py-4 tabular-nums">{payout.commission_amount}</td>
                  <td className="px-4 py-4 font-black tabular-nums">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: payout.currency,
                    }).format(payout.net_amount)}
                  </td>
                  <td className="px-4 py-4 text-xs font-bold">
                    {payout.status}
                    {payout.payment_reference && (
                      <p className="mt-1 font-mono font-normal text-[#718278]">
                        {payout.payment_method} · {payout.payment_reference}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-xs text-[#61766b]">
                    {new Date(payout.created_at).toLocaleDateString('en-GB')}
                    {payout.processed_at && (
                      <p className="mt-1">
                        Paid {new Date(payout.processed_at).toLocaleDateString('en-GB')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <PayoutActions key={payout.status}
                      id={payout.id}
                      status={payout.status}
                      canApprove={approve.data === true}
                      canMarkPaid={paid.data === true}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!records.data?.length && (
          <p className="px-5 py-12 text-center text-sm text-[#61766b]">
            No payouts match this status.
          </p>
        )}
        <AdminPagination
          basePath="/admin/payouts"
          page={page}
          count={records.count ?? 0}
          pageSize={pageSize}
          filters={{ status, q }}
        />
      </div>
    </section>
  );
}
