import Link from 'next/link';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { requireCapabilitiesPage } from '@/lib/admin/access';

const statuses = [
  'ALL',
  'PENDING',
  'IN_REVIEW',
  'PASSED',
  'FAILED',
  'MORE_INFORMATION_REQUIRED',
] as const;
const priorities = ['ALL', 'LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const pageSize = 20;

export default async function AuthenticationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; page?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/authentication', [
    'authentication.review',
  ]);
  const params = await searchParams;
  const status = statuses.find((item) => item === params.status) ?? 'ALL';
  const priority = priorities.find((item) => item === params.priority) ?? 'ALL';
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  let query = supabase
    .from('authentication_records')
    .select(
      'id,status,authenticator_id,assigned_to,priority,created_at,authenticated_at,consignment_submissions(id,brand_name,product_name,seller_id,status)',
      { count: 'exact' }
    )
    .not('consignment_submission_id', 'is', null);
  if (status !== 'ALL') query = query.eq('status', status);
  if (priority !== 'ALL') query = query.eq('priority', priority);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error('Authentication queue is temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Trust / Physical verification
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Authentication queue.</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Human review of submitted evidence and the physical item. No automated authenticity claims
        are made.
      </p>
      <form
        method="get"
        className="mt-7 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e0e9e1] bg-white p-4"
      >
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
        <label className="text-xs font-bold text-[#61766b]">
          Priority
          <select
            name="priority"
            defaultValue={priority}
            className="mt-1 block rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm text-[#173829]"
          >
            {priorities.map((item) => (
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
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                <th className="px-5 py-4">Item</th>
                <th className="px-4 py-4">Seller</th>
                <th className="px-4 py-4">Assigned to</th>
                <th className="px-4 py-4">Priority</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {data?.map((record) => (
                <tr key={record.id} className="hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/authentication/${record.id}`}
                      className="font-bold text-[#154b34] hover:underline"
                    >
                      {record.consignment_submissions
                        ? `${record.consignment_submissions.brand_name} ${record.consignment_submissions.product_name}`
                        : 'Item'}
                    </Link>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {record.consignment_submissions?.seller_id.slice(0, 8) ?? '—'}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {(record.assigned_to ?? record.authenticator_id)?.slice(0, 8) ?? 'Unassigned'}
                  </td>
                  <td className="px-4 py-4 text-xs font-bold">{record.priority}</td>
                  <td className="px-4 py-4 font-bold">{record.status.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-4 text-xs text-[#61766b]">
                    {new Date(record.created_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="px-5 py-12 text-center text-sm text-[#61766b]">No items in this queue.</p>
        )}
        <AdminPagination
          basePath="/admin/authentication"
          page={page}
          count={count ?? 0}
          pageSize={pageSize}
          filters={{ status, priority }}
        />
      </div>
    </section>
  );
}
