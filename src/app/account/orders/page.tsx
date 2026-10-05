import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { readableOrderStatus } from '@/lib/commerce/labels';
import { formatDate, formatPrice } from '@/lib/utils';

export default async function AccountOrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in?redirectTo=/account/orders');

  const { data: orders, error } = await supabase.from('orders')
    .select('id, order_number, created_at, status, payment_status, fulfillment_status, total_amount, currency, order_items(product_name_snapshot, size_snapshot, quantity)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Order history is temporarily unavailable.');

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/account" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"><ArrowLeft className="h-4 w-4" /> Back to account</Link>
        <p className="mt-10 text-[10px] font-bold uppercase tracking-widest text-black/45">Your purchases</p>
        <h1 className="mt-2 text-5xl font-black tracking-[-0.07em] sm:text-7xl">ORDERS.</h1>
        {!orders?.length ? (
          <div className="mt-10 rounded-[2rem] bg-[#efede6] p-8 sm:p-12">
            <h2 className="text-2xl font-black">No orders yet.</h2>
            <p className="mt-2 text-sm text-black/55">The edit is ready when you are.</p>
            <Link href="/new" className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white">Shop the edit</Link>
          </div>
        ) : (
          <div className="mt-10 space-y-3">
            {orders.map((order) => (
              <Link key={order.id} href={`/account/orders/${order.id}`} className="group grid gap-4 rounded-[1.5rem] bg-white p-5 shadow-sm transition hover:shadow-md sm:grid-cols-[1fr_auto] sm:p-7">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">{formatDate(order.created_at)} · {order.order_number}</p>
                  <h2 className="mt-2 text-lg font-black">{order.order_items.map((item) => item.product_name_snapshot).join(', ') || 'Order'}</h2>
                  <p className="mt-2 text-xs text-black/50">{order.order_items.length} {order.order_items.length === 1 ? 'piece' : 'pieces'} · {readableOrderStatus(order.status, order.payment_status)} · {order.fulfillment_status === 'UNFULFILLED' ? 'Preparing' : order.fulfillment_status.replaceAll('_', ' ').toLowerCase()}</p>
                </div>
                <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end">
                  <strong className="text-lg">{formatPrice(Number(order.total_amount), order.currency)}</strong>
                  <ArrowUpRight className="h-5 w-5 transition group-hover:-translate-y-1 group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
