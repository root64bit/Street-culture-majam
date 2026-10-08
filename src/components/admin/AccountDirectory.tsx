import Link from 'next/link';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { AdminPagination } from '@/components/admin/AdminPagination';
export async function AccountDirectory({
  kind,
  searchParams,
}: {
  kind: 'customer' | 'seller';
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const path = `/admin/${kind}s`;
  const { supabase } = await requireCapabilitiesPage(path, [`${kind}s.read`]);
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  const q = (params.q ?? '').trim().slice(0, 120);
  const status = ['ACTIVE', 'SUSPENDED', 'BANNED'].includes(params.status ?? '')
    ? params.status!
    : '';
  const pageSize = 30;
  const { data, error } = await supabase.rpc('admin_account_directory', {
    directory_kind: kind,
    search_text: q,
    status_filter: status,
    page_offset: (page - 1) * pageSize,
    page_limit: pageSize,
  });
  if (error) throw new Error('Account directory is temporarily unavailable.');
  const columns =
    kind === 'customer'
      ? ['Customer', 'Orders', 'Paid spend (MZN)', 'Wishlist', 'Last order', 'Status']
      : [
          'Seller',
          'Verification',
          'Live / sold units',
          'Gross sales (MZN)',
          'Pending / paid (MZN)',
          'Status',
        ];
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#087456]">
        People / {kind === 'customer' ? 'Customers' : 'Sellers'}
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">
        {kind === 'customer' ? 'Customer directory' : 'Seller operations'}
      </h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Real account records and transaction totals. Financial figures below are MZN only.
      </p>
      <form method="get" className="mt-7 flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          aria-label="Search accounts"
          placeholder="Name, email, phone or account ID"
          className="w-80 max-w-full rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          aria-label="Account status"
          className="rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {['ACTIVE', 'SUSPENDED', 'BANNED'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <button className="rounded-lg bg-[#0d211a] px-5 py-2 text-xs font-bold text-white">
          Search
        </button>
      </form>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#dce6dc] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                {columns.map((v) => (
                  <th key={v} className="px-5 py-4">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {data?.map((person) => (
                <tr key={person.id} className="align-top hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4">
                    <Link
                      href={`${path}/${person.id}`}
                      className="font-bold text-[#154b34] hover:underline"
                    >
                      {person.full_name}
                    </Link>
                    <p className="mt-1 text-xs text-[#738479]">{person.email}</p>
                    <p className="mt-1 text-xs text-[#738479]">{person.phone ?? 'No phone'}</p>
                  </td>
                  {kind === 'customer' ? (
                    <>
                      <td className="px-5 py-4">{person.orders_count}</td>
                      <td className="px-5 py-4 font-bold">
                        {person.lifetime_spend.toLocaleString()}
                      </td>
                      <td className="px-5 py-4">{person.wishlist_count}</td>
                      <td className="px-5 py-4 text-xs">
                        {person.last_order_at
                          ? new Date(person.last_order_at).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-4 text-xs">{person.verification_status}</td>
                      <td className="px-5 py-4">
                        {person.active_listings} / {person.sold_listings}
                      </td>
                      <td className="px-5 py-4 font-bold">{person.gross_sales.toLocaleString()}</td>
                      <td className="px-5 py-4">
                        <strong>{person.pending_payouts.toLocaleString()}</strong> /{' '}
                        {person.total_paid.toLocaleString()}
                      </td>
                    </>
                  )}
                  <td className="px-5 py-4 text-xs">{person.account_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="p-12 text-center text-sm text-[#61766b]">
            No accounts match these filters.
          </p>
        )}
        <AdminPagination
          basePath={path}
          page={page}
          count={data?.[0]?.total_count ?? 0}
          pageSize={pageSize}
          filters={{ q, status }}
        />
      </div>
    </section>
  );
}
