import Link from 'next/link';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { requireCapabilitiesPage } from '@/lib/admin/access';

const statuses = [
  'ALL',
  'SUBMITTED',
  'UNDER_REVIEW',
  'MORE_INFORMATION_REQUIRED',
  'APPROVED_FOR_DELIVERY',
  'AWAITING_ITEM',
  'IN_TRANSIT',
  'RECEIVED',
  'AUTHENTICATION_PENDING',
  'AUTHENTICATION_IN_PROGRESS',
  'AUTHENTICATED',
  'AUTHENTICATION_FAILED',
  'READY_TO_LIST',
  'LISTED',
  'SOLD',
  'PAYOUT_PENDING',
  'PAID',
  'REJECTED',
  'RETURNED',
] as const;
const pageSize = 20;

export default async function ConsignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/consignments', ['consignments.read']);
  const params = await searchParams;
  const status = statuses.find((item) => item === params.status) ?? 'ALL';
  const q = (params.q ?? '')
    .trim()
    .slice(0, 120)
    .replace(/[%_,()]/g, '');
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  let query = supabase
    .from('consignment_submissions')
    .select(
      'id,seller_id,brand_name,product_name,size,condition,expected_price,currency,status,received_at,created_at,authentication_records(status),listings(status)',
      { count: 'exact' }
    );
  if (status !== 'ALL') query = query.eq('status', status);
  if (q)
    query = /^[0-9a-f-]{36}$/i.test(q)
      ? query.or(`id.eq.${q},seller_id.eq.${q}`)
      : query.or(`brand_name.ilike.%${q}%,product_name.ilike.%${q}%`);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error('Consignment submissions are temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Seller operations
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Consignments.</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Follow each physical item from seller submission through authentication, listing, sale and
        payout.
      </p>
      <form
        method="get"
        className="mt-7 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e0e9e1] bg-white p-4"
      >
        <label className="text-xs font-bold text-[#61766b]">
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Brand, product or UUID"
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
          <table className="w-full min-w-[1020px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                <th className="px-5 py-4">Submission</th>
                <th className="px-4 py-4">Seller</th>
                <th className="px-4 py-4">Condition</th>
                <th className="px-4 py-4">Expected</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Received</th>
                <th className="px-4 py-4">Auth / Listing</th>
                <th className="px-4 py-4">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {data?.map((submission) => (
                <tr key={submission.id} className="align-top hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/consignments/${submission.id}`}
                      className="font-bold text-[#154b34] hover:underline"
                    >
                      {submission.brand_name} {submission.product_name}
                    </Link>
                    <p className="mt-1 text-xs text-[#738479]">
                      {submission.size} · {submission.id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {submission.seller_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-4">{submission.condition}</td>
                  <td className="px-4 py-4 font-bold tabular-nums">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: submission.currency,
                    }).format(submission.expected_price)}
                  </td>
                  <td className="px-4 py-4 text-xs font-bold">
                    {submission.status.replaceAll('_', ' ')}
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {submission.received_at
                      ? new Date(submission.received_at).toLocaleDateString('en-GB')
                      : 'No'}
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {submission.authentication_records.at(-1)?.status ?? '—'} /{' '}
                    {submission.listings.at(-1)?.status ?? '—'}
                  </td>
                  <td className="px-4 py-4 text-xs text-[#61766b]">
                    {new Date(submission.created_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="px-5 py-12 text-center text-sm text-[#61766b]">
            No consignments match this filter.
          </p>
        )}
        <AdminPagination
          basePath="/admin/consignments"
          page={page}
          count={count ?? 0}
          pageSize={pageSize}
          filters={{ status, q }}
        />
      </div>
    </section>
  );
}
