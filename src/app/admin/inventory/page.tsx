import { AdminPagination } from '@/components/admin/AdminPagination';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { InventoryActions } from '@/components/admin/InventoryActions';
import Link from 'next/link';
import { validId } from '@/lib/admin/filters';

const statuses = [
  'ALL',
  'DRAFT',
  'PENDING_REVIEW',
  'PENDING_AUTHENTICATION',
  'APPROVED',
  'LIVE',
  'RESERVED',
  'SOLD',
  'REJECTED',
  'RETURNED',
  'ARCHIVED',
] as const;
const ownerships = ['ALL', 'STREET_CULTURE', 'CONSIGNMENT', 'PROFESSIONAL_SELLER'] as const;
const pageSize = 20;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    ownership?: string;
    page?: string;
    q?: string;
    seller?: string;
    auth?: string;
  }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/inventory', ['inventory.read']);
  const { data: canManage } = await supabase.rpc('has_capability', {
    check_capability: 'inventory.manage',
  });
  const params = await searchParams;
  const status = statuses.find((candidate) => candidate === params.status) ?? 'ALL';
  const ownership = ownerships.find((candidate) => candidate === params.ownership) ?? 'ALL';
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  const q = (params.q ?? '')
    .trim()
    .slice(0, 120)
    .replace(/[%_,()]/g, '');
  const seller = validId(params.seller);
  const auth = ['PENDING', 'IN_REVIEW', 'PASSED', 'FAILED'].includes(params.auth ?? '')
    ? params.auth!
    : '';
  let query = supabase
    .from('listings')
    .select(
      'id,product_id,seller_id,asking_price,currency,status,ownership_type,condition,authentication_status,reserved_by_order_id,reservation_expires_at,sold_at,created_at,products!inner(name),product_variants(size,size_system)',
      { count: 'exact' }
    );
  if (status !== 'ALL') query = query.eq('status', status);
  if (ownership !== 'ALL') query = query.eq('ownership_type', ownership);
  if (q) query = validId(q) ? query.eq('id', q) : query.ilike('products.name', `%${q}%`);
  if (seller) query = query.eq('seller_id', seller);
  if (auth)
    query = query.eq(
      'authentication_status',
      auth as 'PENDING' | 'IN_REVIEW' | 'PASSED' | 'FAILED'
    );
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error('Inventory is temporarily unavailable.');
  const filters = { status, ownership, q, seller, auth };

  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Catalog / Inventory
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Every unit, accounted for.</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Actual listing state, ownership, price and reservation. A product draft is not sellable
        inventory.
      </p>
      <form
        className="mt-7 flex flex-wrap gap-3 rounded-2xl border border-[#e0e9e1] bg-white p-4"
        method="get"
      >
        <label className="text-xs font-bold text-[#61766b]">
          Product / listing UUID
          <input name="q" defaultValue={q} className="mt-1 block rounded-lg border p-2 text-sm" />
        </label>
        <label className="text-xs font-bold text-[#61766b]">
          Seller UUID
          <input
            name="seller"
            defaultValue={seller}
            className="mt-1 block rounded-lg border p-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-[#61766b]">
          Authentication
          <select
            name="auth"
            defaultValue={auth}
            className="mt-1 block rounded-lg border p-2 text-sm"
          >
            <option value="">All</option>
            {['PENDING', 'IN_REVIEW', 'PASSED', 'FAILED'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
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
        <label className="text-xs font-bold text-[#61766b]">
          Ownership
          <select
            name="ownership"
            defaultValue={ownership}
            className="mt-1 block rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm text-[#173829]"
          >
            {ownerships.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="self-end rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white">
          Apply filters
        </button>
      </form>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e0e9e1] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                <th className="px-5 py-4">Product / Size</th>
                <th className="px-4 py-4">Ownership</th>
                <th className="px-4 py-4">Condition</th>
                <th className="px-4 py-4">Price</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Reservation / Sold</th>
                {canManage && <th className="px-4 py-4">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {data?.map((listing) => (
                <tr key={listing.id} className="align-top hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/products/${listing.product_id}`}
                      className="font-bold text-[#154b34] hover:underline"
                    >
                      {listing.products?.name ?? 'Unknown product'}
                    </Link>
                    <p className="mt-1 text-xs text-[#738479]">
                      {listing.product_variants?.size_system} {listing.product_variants?.size} ·{' '}
                      {listing.id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {listing.ownership_type}
                    {listing.seller_id && (
                      <Link
                        href={`/admin/sellers/${listing.seller_id}`}
                        className="mt-1 block font-mono text-xs underline"
                      >
                        Seller {listing.seller_id.slice(0, 8)}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {listing.condition}
                    <p className="mt-1 text-xs text-[#738479]">
                      Auth: {listing.authentication_status}
                    </p>
                  </td>
                  <td className="px-4 py-4 font-bold tabular-nums">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: listing.currency,
                    }).format(listing.asking_price)}
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-[#eef7f1] px-2.5 py-1 text-[10px] font-bold text-[#126347]">
                      {listing.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs text-[#61766b]">
                    {listing.reserved_by_order_id ? (
                      <>
                        <Link
                          href={`/admin/orders/${listing.reserved_by_order_id}`}
                          className="underline"
                        >
                          Order {listing.reserved_by_order_id.slice(0, 8)}
                        </Link>
                        <p className="mt-1">
                          Expires{' '}
                          {listing.reservation_expires_at
                            ? new Date(listing.reservation_expires_at).toLocaleString('en-GB')
                            : '—'}
                        </p>
                      </>
                    ) : listing.sold_at ? (
                      `Sold ${new Date(listing.sold_at).toLocaleDateString('en-GB')}`
                    ) : (
                      '—'
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-4">
                      <InventoryActions
                        id={listing.id}
                        status={listing.status}
                        authenticationStatus={listing.authentication_status}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="px-5 py-12 text-center text-sm text-[#61766b]">
            No listings match these filters.
          </p>
        )}
        <AdminPagination
          basePath="/admin/inventory"
          page={page}
          count={count ?? 0}
          pageSize={pageSize}
          filters={filters}
        />
      </div>
    </section>
  );
}
