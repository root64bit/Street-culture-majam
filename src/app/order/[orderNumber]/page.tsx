import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { guestOrderCookieName, hashGuestOrderToken } from '@/lib/payments/guest-checkout';
import { formatDate, formatPrice } from '@/lib/utils';
import { timingSafeEqual } from 'node:crypto';
import { orderEventLabels, readableOrderStatus } from '@/lib/commerce/labels';

function safeTokenMatch(token: string | undefined, storedHash: string | null) {
  if (!token || !storedHash) return false;
  const supplied = Buffer.from(hashGuestOrderToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export default async function GuestOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  if (!/^SC[A-F0-9]{8}$/.test(orderNumber)) notFound();

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, order_number, created_at, status, payment_status, fulfillment_status, subtotal, shipping_amount, total_amount, currency, shipping_address_snapshot, shipping_method_snapshot, guest_access_token_hash')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (!order) notFound();

  const cookieStore = await cookies();
  const guestAccess = safeTokenMatch(
    cookieStore.get(guestOrderCookieName(order.id))?.value,
    order.guest_access_token_hash,
  );
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!guestAccess && (!user || order.user_id !== user.id)) notFound();

  const [{ data: items }, { data: events }] = await Promise.all([
    admin.from('order_items')
      .select('id, product_name_snapshot, brand_name_snapshot, size_snapshot, condition_snapshot, unit_price, quantity')
      .eq('order_id', order.id),
    admin.from('order_events')
      .select('id, event_type, created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true }),
  ]);
  const address = order.shipping_address_snapshot as Record<string, unknown>;
  const method = order.shipping_method_snapshot as Record<string, unknown>;
  const timeline = (events ?? []).filter((event) => orderEventLabels[event.event_type]);

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
        <div className="mt-8 flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-acid"><CheckCircle2 className="h-6 w-6" /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-black/45">Order {order.order_number}</p><h1 className="mt-2 text-4xl font-black tracking-[-0.06em] sm:text-6xl">Your order</h1><p className="mt-2 text-sm text-black/55">Placed {formatDate(order.created_at)} · {readableOrderStatus(order.status, order.payment_status)}</p></div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[1.5rem] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xs font-bold uppercase tracking-wider">Pieces</h2>
            <div className="mt-5 divide-y divide-black/10">
              {(items ?? []).map((item) => <div key={item.id} className="flex justify-between gap-4 py-4 text-sm"><div><p className="font-bold">{item.product_name_snapshot}</p><p className="mt-1 text-xs text-black/50">{item.brand_name_snapshot} · Size {item.size_snapshot} · {item.condition_snapshot}</p></div><strong>{formatPrice(Number(item.unit_price) * item.quantity, 'MZN')}</strong></div>)}
            </div>
            <div className="mt-4 space-y-2 border-t border-black/10 pt-4 text-sm"><p className="flex justify-between"><span>Subtotal</span><strong>{formatPrice(Number(order.subtotal), 'MZN')}</strong></p><p className="flex justify-between"><span>Delivery</span><strong>{formatPrice(Number(order.shipping_amount), 'MZN')}</strong></p><p className="flex justify-between border-t border-black/10 pt-3 text-lg font-black"><span>Total</span><span>{formatPrice(Number(order.total_amount), 'MZN')}</span></p></div>
          </section>
          <div className="space-y-6">
            <section className="rounded-[1.5rem] bg-[#efede6] p-5 sm:p-7"><h2 className="text-xs font-bold uppercase tracking-wider">Delivery</h2><p className="mt-4 text-sm font-semibold">{String(method.name ?? 'Delivery method pending')}</p><p className="mt-2 text-sm leading-6 text-black/55">{String(address.address_line_1 ?? '')}{address.address_line_2 ? `, ${String(address.address_line_2)}` : ''}<br />{String(address.city ?? '')}, {String(address.province ?? '')}<br />Mozambique</p></section>
            <section className="rounded-[1.5rem] bg-[#efede6] p-5 sm:p-7"><h2 className="text-xs font-bold uppercase tracking-wider">Order timeline</h2><ol className="mt-5 space-y-4">{timeline.map((event) => <li key={event.id} className="flex gap-3 text-sm"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-black" /><div><p className="font-semibold">{orderEventLabels[event.event_type]}</p><p className="text-xs text-black/45">{formatDate(event.created_at)}</p></div></li>)}</ol></section>
          </div>
        </div>
      </div>
    </main>
  );
}
