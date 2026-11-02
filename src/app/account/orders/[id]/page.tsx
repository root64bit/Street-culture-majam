import Link from 'next/link';
import { redirect } from 'next/navigation';
import { privateAccessUrl } from '@/lib/access-links';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  orderEventLabels,
  orderFulfillmentLabel,
  readableOrderStatus,
} from '@/lib/commerce/labels';
import { formatDate } from '@/lib/utils';
import { formatOrderMoney as formatPrice, formatOrderTimestamp } from '@/lib/commerce/order-money';
import { DeliveryAddress } from '@/components/commerce/DeliveryAddress';
import { OrderShipmentStatus } from '@/components/commerce/OrderShipmentStatus';
import { OrderPaymentSummary } from '@/components/commerce/OrderPaymentSummary';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const returnTo=`/account/orders/${encodeURIComponent(id)}`;
  if (!/^[a-f0-9-]{36}$/i.test(id)) redirect(privateAccessUrl(returnTo,'order'));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(returnTo)}`);
  const [{ data: order }, { data: events }] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id, order_number, created_at, status, payment_status, fulfillment_status, subtotal, shipping_amount, total_amount, currency, shipping_address_snapshot, shipping_method_snapshot, order_items(id, product_name_snapshot, brand_name_snapshot, size_snapshot, condition_snapshot, unit_price, quantity)'
      )
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('order_events')
      .select('id, event_type, created_at')
      .eq('order_id', id)
      .order('created_at'),
  ]);
  if (!order) redirect(privateAccessUrl(returnTo,'order'));
  const address = order.shipping_address_snapshot as Record<string, unknown>;
  const method = order.shipping_method_snapshot as Record<string, unknown>;

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <p className="mt-10 text-[10px] font-bold uppercase tracking-widest text-black/45">
          {formatDate(order.created_at)}
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.07em] sm:text-6xl">
          ORDER {order.order_number}.
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          {readableOrderStatus(order.status, order.payment_status)} ·{' '}
          {orderFulfillmentLabel(order.status, order.payment_status, order.fulfillment_status)}
        </p>
        <OrderPaymentSummary orderId={order.id} />
        <div className="mt-10 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[1.5rem] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xs font-bold uppercase tracking-wider">Your pieces</h2>
            <div className="mt-5 divide-y divide-black/10">
              {order.order_items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 py-4 text-sm">
                  <div>
                    <p className="font-bold">{item.product_name_snapshot}</p>
                    <p className="mt-1 text-xs text-black/50">
                      {item.brand_name_snapshot} · Size {item.size_snapshot} ·{' '}
                      {item.condition_snapshot}
                    </p>
                  </div>
                  <strong>
                    {formatPrice(Number(item.unit_price) * item.quantity, order.currency)}
                  </strong>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-black/10 pt-4 text-sm">
              <p className="flex justify-between">
                <span>Subtotal</span>
                <strong>{formatPrice(Number(order.subtotal), order.currency)}</strong>
              </p>
              <p className="flex justify-between">
                <span>Delivery</span>
                <strong>{formatPrice(Number(order.shipping_amount), order.currency)}</strong>
              </p>
              <p className="flex justify-between border-t border-black/10 pt-3 text-lg font-black">
                <span>Total</span>
                <span>{formatPrice(Number(order.total_amount), order.currency)}</span>
              </p>
            </div>
          </section>
          <div className="space-y-6">
            <section className="rounded-[1.5rem] bg-[#efede6] p-5 sm:p-7">
              <h2 className="text-xs font-bold uppercase tracking-wider">Delivery</h2>
              <p className="mt-4 text-sm font-semibold">
                {String(method.name ?? 'Delivery method pending')}
              </p>
              <DeliveryAddress address={address} />
              <OrderShipmentStatus orderId={order.id} />
            </section>
            <section className="rounded-[1.5rem] bg-[#efede6] p-5 sm:p-7">
              <h2 className="text-xs font-bold uppercase tracking-wider">Order timeline</h2>
              <ol className="mt-5 space-y-4">
                {(events ?? [])
                  .filter((event) => orderEventLabels[event.event_type])
                  .map((event) => (
                    <li key={event.id} className="flex gap-3 text-sm">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-black" />
                      <div>
                        <p className="font-semibold">{orderEventLabels[event.event_type]}</p>
                        <p className="text-xs text-neutral-600">
                          <time dateTime={event.created_at}>
                            {formatOrderTimestamp(event.created_at)}
                          </time>
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
