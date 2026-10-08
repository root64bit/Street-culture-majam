import Link from 'next/link';
import { validDate, validId } from '@/lib/admin/filters';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { requireCapabilitiesPage } from '@/lib/admin/access';

const statuses = [
  'ALL',
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'READY_FOR_PICKUP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;
const payments = ['ALL', 'UNPAID', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED'] as const;
const fulfillment = [
  'ALL',
  'UNFULFILLED',
  'IN_AUTHENTICATION',
  'PACKED',
  'READY_FOR_PICKUP',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
] as const;
const pageSize = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    payment?: string;
    fulfillment?: string;
    q?: string;
    page?: string;
    from?: string;
    to?: string;
    customer?: string;
    provider?: string;
  }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/orders', ['orders.read']);
  const params = await searchParams;
  const status = statuses.find((item) => item === params.status) ?? 'ALL';
  const payment = payments.find((item) => item === params.payment) ?? 'ALL';
  const fulfill = fulfillment.find((item) => item === params.fulfillment) ?? 'ALL';
  const q = (params.q ?? '')
    .trim()
    .slice(0, 64)
    .replace(/[%_,()]/g, '');
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  const from = validDate(params.from) ?? '';
  const to = validDate(params.to) ?? '';
  const customer = validId(params.customer) ? params.customer! : '';
  const provider = params.provider === 'mpesa' ? 'mpesa' : '';
  const result = await supabase.rpc('admin_order_workspace', {
    search_text: q,
    order_filter: status === 'ALL' ? '' : status,
    payment_filter: payment === 'ALL' ? '' : payment,
    fulfillment_filter: fulfill === 'ALL' ? '' : fulfill,
    from_date: from || undefined,
    to_date: to || undefined,
    customer_filter: customer || undefined,
    provider_filter: provider,
    page_offset: (page - 1) * pageSize,
    page_limit: pageSize,
  });
  const { data, error } = result;
  const count = Number(data?.[0]?.total_count ?? 0);
  if (error) throw new Error('Orders are temporarily unavailable.');
  const filters = { status, payment, fulfillment: fulfill, q, from, to, customer, provider };

  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Commerce / Orders
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Orders in motion.</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Payment, order and fulfillment are independent states. Open an order to inspect the full
        record.
      </p>
      <form
        method="get"
        className="mt-7 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e0e9e1] bg-white p-4"
      >
        <label className="text-xs font-bold text-[#61766b]">
          Order, email, phone, reference
          <input
            name="q"
            defaultValue={q}
            maxLength={64}
            placeholder="Search orders"
            className="mt-1 block w-48 rounded-lg border border-[#dce6dc] px-3 py-2 text-sm"
          />
        </label>
        {(
          [
            { name: 'status', label: 'Order', value: status, options: statuses },
            { name: 'payment', label: 'Payment', value: payment, options: payments },
            { name: 'fulfillment', label: 'Fulfillment', value: fulfill, options: fulfillment },
          ] as const
        ).map((field) => (
          <label key={field.name} className="text-xs font-bold text-[#61766b]">
            {field.label}
            <select
              name={field.name}
              defaultValue={field.value}
              className="mt-1 block rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm text-[#173829]"
            >
              {field.options.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        ))}
        {(
          [
            { name: 'from', label: 'From', type: 'date', value: from },
            { name: 'to', label: 'Through', type: 'date', value: to },
            { name: 'customer', label: 'Customer UUID', type: 'text', value: customer },
          ] as const
        ).map((field) => (
          <label key={field.name} className="text-xs font-bold text-[#61766b]">
            {field.label}
            <input
              name={field.name}
              type={field.type}
              defaultValue={field.value}
              className="mt-1 block rounded-lg border p-2 text-sm"
            />
          </label>
        ))}
        <label className="text-xs font-bold text-[#61766b]">
          Provider
          <select
            name="provider"
            defaultValue={provider}
            className="mt-1 block rounded-lg border p-2 text-sm"
          >
            <option value="">All</option>
            <option value="mpesa">MineScope / M-Pesa</option>
          </select>
        </label>
        <button className="rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white">
          Filter
        </button>
      </form>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e0e9e1] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                <th className="px-5 py-4">Order</th>
                <th className="px-4 py-4">Customer</th>
                <th className="px-4 py-4">Items</th>
                <th className="px-4 py-4">Payment</th>
                <th className="px-4 py-4">Fulfillment</th>
                <th className="px-4 py-4">Total</th>
                <th className="px-4 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {data?.map((order) => (
                <tr key={order.id} className="hover:bg-[#fbfdf9]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-black text-[#154b34] hover:underline"
                    >
                      {order.order_number}
                    </Link>
                    <p className="mt-1 text-[11px] text-[#738479]">{order.status}</p>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {order.guest_name ||
                      order.guest_email ||
                      (order.user_id ? `Account ${order.user_id.slice(0, 8)}` : 'Guest')}
                  </td>
                  <td className="px-4 py-4 tabular-nums">{order.items_count ?? 0}</td>
                  <td className="px-4 py-4">{order.payment_status}</td>
                  <td className="px-4 py-4">{order.fulfillment_status}</td>
                  <td className="px-4 py-4 font-bold tabular-nums">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: order.currency,
                    }).format(order.total_amount)}
                  </td>
                  <td className="px-4 py-4 text-xs text-[#61766b]">
                    {new Date(order.created_at).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <p className="px-5 py-12 text-center text-sm text-[#61766b]">
            No orders match these filters.
          </p>
        )}
        <AdminPagination
          basePath="/admin/orders"
          page={page}
          count={count ?? 0}
          pageSize={pageSize}
          filters={filters}
        />
      </div>
    </section>
  );
}
