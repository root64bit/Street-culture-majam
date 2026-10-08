import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { AdminActionForm } from '@/components/admin/AdminActionForm';
export async function AccountDetail({
  kind,
  params,
}: {
  kind: 'customer' | 'seller';
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const path = `/admin/${kind}s`;
  const { supabase } = await requireCapabilitiesPage(`${path}/${id}`, [`${kind}s.read`]);
  const [directory, notes, permissions] = await Promise.all([
    supabase.rpc('admin_account_directory', {
      directory_kind: kind,
      search_text: id,
      page_limit: 1,
    }),
    supabase
      .from('account_operator_notes')
      .select('id,note,created_by,created_at')
      .eq('account_id', id)
      .eq('context', kind)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.rpc('my_capabilities'),
  ]);
  if (directory.error || notes.error || permissions.error)
    throw new Error('Account detail is temporarily unavailable.');
  const person = directory.data?.find((v) => v.id === id);
  if (!person) notFound();
  const allowed = new Set(permissions.data?.map((v) => v.capability));
  const orders = allowed.has('orders.read')
    ? await supabase
        .from('orders')
        .select('id,order_number,status,payment_status,total_amount,currency,created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20)
    : null;
  const consignments = allowed.has('consignments.read')
    ? await supabase
        .from('consignment_submissions')
        .select('id,product_name,status,expected_price,currency,created_at')
        .eq('seller_id', id)
        .order('created_at', { ascending: false })
        .limit(20)
    : null;
  const listings =
    kind === 'seller'
      ? await supabase
          .from('listings')
          .select('id,status,asking_price,currency,products(name)')
          .eq('seller_id', id)
          .order('created_at', { ascending: false })
          .limit(20)
      : null;
  const payouts =
    kind === 'seller' && allowed.has('payouts.read')
      ? await supabase
          .from('seller_payouts')
          .select('id,status,net_amount,currency,created_at')
          .eq('seller_id', id)
          .order('created_at', { ascending: false })
          .limit(20)
      : null;
  if ([orders, consignments, listings, payouts].some((result) => result?.error))
    throw new Error('Linked account history unavailable.');
  const metrics =
    kind === 'customer'
      ? [
          ['Orders', person.orders_count],
          ['Paid spend (MZN)', person.lifetime_spend],
          ['Wishlist', person.wishlist_count],
        ]
      : [
          ['Active units', person.active_listings],
          ['Sold units', person.sold_listings],
          ['Gross (MZN)', person.gross_sales],
          ['Pending payout (MZN)', person.pending_payouts],
          ['Paid out (MZN)', person.total_paid],
          ['Consignments', person.consignments_count],
        ];
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <Link href={path} className="text-xs font-bold text-[#087456]">
        ← Directory
      </Link>
      <h1 className="mt-5 text-4xl font-black tracking-[-0.05em]">{person.full_name}</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        {person.email} · {person.phone ?? 'No phone'} · {person.account_status}
      </p>
      <p className="mt-1 font-mono text-xs text-[#718278]">{id}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#dce6dc] bg-white p-4">
            <p className="text-xs text-[#61766b]">{label}</p>
            <p className="mt-2 text-xl font-black">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          {orders && (
            <section className="rounded-2xl border border-[#dce6dc] bg-white p-5">
              <h2 className="font-black">Recent orders</h2>
              <div className="mt-4 divide-y divide-[#edf1ec]">
                {orders.data?.map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="flex justify-between gap-3 py-3 text-sm hover:text-[#087456]"
                  >
                    <span className="font-bold">
                      {order.order_number}
                      <small className="mt-1 block text-xs font-normal text-[#718278]">
                        {order.status} · {order.payment_status}
                      </small>
                    </span>
                    <span>
                      {order.total_amount.toLocaleString()} {order.currency}
                    </span>
                  </Link>
                ))}
              </div>
              {!orders.data?.length && (
                <p className="mt-3 text-sm text-[#718278]">No orders yet.</p>
              )}
            </section>
          )}
          {consignments && (
            <section className="rounded-2xl border border-[#dce6dc] bg-white p-5">
              <h2 className="font-black">Recent consignments</h2>
              {consignments.data?.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/consignments/${item.id}`}
                  className="mt-3 block text-sm font-bold text-[#154b34] hover:underline"
                >
                  {item.product_name}
                  <small className="mt-1 block text-xs font-normal text-[#718278]">
                    {item.status.replaceAll('_', ' ')}
                  </small>
                </Link>
              ))}
              {!consignments.data?.length && (
                <p className="mt-3 text-sm text-[#718278]">No consignments yet.</p>
              )}
            </section>
          )}
          {listings && (
            <section className="rounded-2xl border border-[#dce6dc] bg-white p-5">
              <h2 className="font-black">Recent inventory</h2>
              {listings.data?.map((item) => (
                <div key={item.id} className="mt-3 flex justify-between gap-3 text-sm">
                  <span>
                    {item.products?.name}
                    <small className="mt-1 block text-xs text-[#718278]">{item.status}</small>
                  </span>
                  <span>
                    {item.asking_price.toLocaleString()} {item.currency}
                  </span>
                </div>
              ))}
              {!listings.data?.length && (
                <p className="mt-3 text-sm text-[#718278]">No listings yet.</p>
              )}
            </section>
          )}
          {payouts && (
            <section className="rounded-2xl border border-[#dce6dc] bg-white p-5">
              <h2 className="font-black">Recent payouts</h2>
              {payouts.data?.map((item) => (
                <p key={item.id} className="mt-3 text-sm">
                  {item.net_amount.toLocaleString()} {item.currency} · {item.status}
                </p>
              ))}
              {!payouts.data?.length && (
                <p className="mt-3 text-sm text-[#718278]">No payouts yet.</p>
              )}
            </section>
          )}
        </div>
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#dce6dc] bg-white p-5">
            <h2 className="mb-4 font-black">Private operator notes</h2>
            {allowed.has(`${kind}s.notes`) && (
              <AdminActionForm
                endpoint={`/api/admin/accounts/${id}`}
                actions={[{ value: 'ADD_NOTE', label: 'Add private note' }]}
                fields={[
                  { name: 'context', label: 'Context', options: [{ value: kind, label: kind }] },
                ]}
              />
            )}
            <ol className="mt-5 space-y-4">
              {notes.data?.map((entry) => (
                <li key={entry.id} className="border-l-2 border-[#dcebe0] pl-3">
                  <p className="whitespace-pre-wrap text-sm">{entry.note}</p>
                  <p className="mt-1 text-[11px] text-[#718278]">
                    {new Date(entry.created_at).toLocaleString('en-GB', {
                      timeZone: 'Africa/Maputo',
                    })}{' '}
                    · {entry.created_by?.slice(0, 8)}
                  </p>
                </li>
              ))}
            </ol>
            {!notes.data?.length && (
              <p className="mt-4 text-sm text-[#718278]">No operator notes.</p>
            )}
          </section>
          {allowed.has('users.manage') && (
            <section className="rounded-2xl border border-[#dce6dc] bg-white p-5">
              <h2 className="mb-4 font-black">Account status</h2>
              <p className="mb-4 text-xs text-[#61766b]">
                Suspension blocks admin permissions and new authenticated orders/consignments.
                Existing order access and public guest browsing remain available.
              </p>
              <AdminActionForm
                endpoint={`/api/admin/accounts/${id}`}
                actions={['ACTIVE', 'SUSPENDED', 'BANNED']
                  .filter((v) => v !== person.account_status)
                  .map((v) => ({ value: v, label: v }))}
              />
            </section>
          )}
          {kind === 'seller' &&
            person.verification_status !== 'NOT_REGISTERED' &&
            allowed.has('users.manage') && (
              <section className="rounded-2xl border bg-white p-5">
                <h2 className="mb-4 font-black">
                  Seller verification · {person.verification_status}
                </h2>
                <AdminActionForm
                  endpoint={`/api/admin/accounts/${id}`}
                  actions={[
                    { value: 'VERIFY_SELLER', label: 'Record manual verification decision' },
                  ]}
                  fields={[
                    {
                      name: 'status',
                      label: 'Verification status',
                      options: ['PENDING', 'VERIFIED', 'REJECTED', 'UNVERIFIED'].map((v) => ({
                        value: v,
                        label: v,
                      })),
                    },
                  ]}
                />
              </section>
            )}
        </div>
      </div>
      <p className="mt-5 text-xs text-[#718278]">
        Detail sections show the 20 most recent linked records. Use the main modules for paginated
        history.
      </p>
    </section>
  );
}
