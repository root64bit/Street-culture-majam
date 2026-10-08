import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderFulfillmentActions } from '@/components/admin/OrderFulfillmentActions';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { AdminActionForm } from '@/components/admin/AdminActionForm';
import type { Json } from '@/types/database.types';

function Snapshot({ value }: { value: Json }) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return <p className="text-sm text-[#718278]">Not provided</p>;
  const entries = Object.entries(value).filter(
    ([, item]) => item !== null && typeof item !== 'object'
  );
  return entries.length ? (
    <dl className="mt-3 space-y-2 text-sm">
      {entries.map(([key, item]) => (
        <div key={key} className="flex justify-between gap-4">
          <dt className="capitalize text-[#718278]">{key.replaceAll('_', ' ')}</dt>
          <dd className="text-right font-semibold">{String(item)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="text-sm text-[#718278]">Not provided</p>
  );
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireCapabilitiesPage(`/admin/orders/${id}`, ['orders.read']);
  const [orderResult, itemsResult, eventsResult, paymentsResult, updatePermission] =
    await Promise.all([
      supabase.from('orders').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('order_items')
        .select(
          'id,product_name_snapshot,brand_name_snapshot,size_snapshot,condition_snapshot,quantity,unit_price,listing_id'
        )
        .eq('order_id', id),
      supabase
        .from('order_events')
        .select('id,event_type,metadata,created_at,created_by')
        .eq('order_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select(
          'id,provider,provider_reference,amount,currency,status,created_at,paid_at,failed_at'
        )
        .eq('order_id', id)
        .order('created_at', { ascending: false }),
      supabase.rpc('has_capability', { check_capability: 'orders.update' }),
    ]);
  if (
    orderResult.error ||
    itemsResult.error ||
    eventsResult.error ||
    paymentsResult.error ||
    updatePermission.error
  )
    throw new Error('Order detail is temporarily unavailable.');
  const order = orderResult.data;
  if (!order) notFound();
  const [operatorNotes, refundRequest, refundPermission] = await Promise.all([
    supabase
      .from('order_operator_notes')
      .select('id,note,created_at,created_by')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('order_refund_requests').select('*').eq('order_id', id).maybeSingle(),
    supabase.rpc('has_capability', { check_capability: 'payments.refund' }),
  ]);
  const pickup =
    order.shipping_method_snapshot &&
    typeof order.shipping_method_snapshot === 'object' &&
    !Array.isArray(order.shipping_method_snapshot) &&
    String(order.shipping_method_snapshot.code ?? '')
      .toUpperCase()
      .includes('PICKUP');

  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <Link href="/admin/orders" className="text-xs font-bold text-[#087456] hover:underline">
        ← All orders
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
            Order record
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">{order.order_number}</h1>
          <p className="mt-2 text-sm text-[#61766b]">
            Created {new Date(order.created_at).toLocaleString('en-GB')} · {order.status}
          </p>
        </div>
        <p className="text-3xl font-black tabular-nums">
          {new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: order.currency }).format(
            order.total_amount
          )}
        </p>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {[
          ['Order', order.status],
          ['Payment', order.payment_status],
          ['Fulfillment', order.fulfillment_status],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <p className="text-xs text-[#718278]">{label}</p>
            <p className="mt-2 text-lg font-black">{value.replaceAll('_', ' ')}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Items</h2>
            <div className="mt-4 divide-y divide-[#edf1ec]">
              {itemsResult.data?.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 py-4">
                  <div>
                    <p className="font-bold">{item.product_name_snapshot}</p>
                    <p className="mt-1 text-xs text-[#718278]">
                      {item.brand_name_snapshot} · {item.size_snapshot} · {item.condition_snapshot}{' '}
                      · Qty {item.quantity}
                    </p>
                    {item.listing_id && (
                      <p className="mt-1 text-[11px] text-[#718278]">Listing {item.listing_id}</p>
                    )}
                  </div>
                  <p className="shrink-0 font-black tabular-nums">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: order.currency,
                    }).format(item.unit_price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-[#edf1ec] pt-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <strong>{order.subtotal}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Shipping</span>
                <strong>{order.shipping_amount}</strong>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Discount</span>
                <strong>{order.discount_amount}</strong>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Payment attempts</h2>
            {paymentsResult.data?.length ? (
              <div className="mt-4 divide-y divide-[#edf1ec]">
                {paymentsResult.data.map((payment) => (
                  <div key={payment.id} className="py-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong>
                        {payment.provider} · {payment.status}
                      </strong>
                      <span>{new Date(payment.created_at).toLocaleString('en-GB')}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#718278]">
                      Reference {payment.provider_reference ?? 'Pending'} · {payment.amount}{' '}
                      {payment.currency}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[#718278]">No payment attempt recorded.</p>
            )}
          </section>
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Timeline</h2>
            {eventsResult.data?.length ? (
              <ol className="mt-4 space-y-4 border-l-2 border-[#dcebe0] pl-5">
                {eventsResult.data.map((event) => (
                  <li key={event.id}>
                    <p className="text-sm font-bold">{event.event_type.replaceAll('_', ' ')}</p>
                    <p className="text-xs text-[#718278]">
                      {new Date(event.created_at).toLocaleString('en-GB')}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-[#718278]">No timeline events yet.</p>
            )}
          </section>
        </div>
        <div className="space-y-6">
          {updatePermission.data && (
            <OrderFulfillmentActions
              orderId={order.id}
              status={order.status}
              fulfillment={order.fulfillment_status}
              payment={order.payment_status}
              pickup={Boolean(pickup)}
            />
          )}
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Customer</h2>
            <p className="mt-3 text-sm">
              {order.guest_name || (order.user_id ? `Account ${order.user_id}` : 'Guest checkout')}
            </p>
            {order.guest_email && (
              <p className="mt-1 text-sm text-[#718278]">{order.guest_email}</p>
            )}
            {order.guest_phone && (
              <p className="mt-1 text-sm text-[#718278]">{order.guest_phone}</p>
            )}
          </section>
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Shipping address</h2>
            <Snapshot value={order.shipping_address_snapshot} />
          </section>
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Billing address</h2>
            <Snapshot value={order.billing_address_snapshot} />
          </section>
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
          <h2 className="mb-4 text-lg font-black">Private operator notes</h2>
          {updatePermission.data && (
            <AdminActionForm
              endpoint={`/api/admin/orders/${id}/operations`}
              actions={[{ value: 'ADD_NOTE', label: 'Add internal note' }]}
            />
          )}
          <ol className="mt-4 space-y-4">
            {operatorNotes.data?.map((entry) => (
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
          {!operatorNotes.data?.length && (
            <p className="mt-3 text-sm text-[#718278]">No internal notes.</p>
          )}
        </section>
        <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
          <h2 className="mb-3 text-lg font-black">Cancellation & refunds</h2>
          <p className="mb-4 text-sm text-[#61766b]">
            Cancel unpaid pending orders only. A refund request does not move money. Finance records
            a verified external full refund; stock remains sold until its physical return is
            inspected.
          </p>
          {updatePermission.data &&
            order.status === 'PENDING' &&
            order.payment_status !== 'PAID' && (
              <AdminActionForm
                endpoint={`/api/admin/orders/${id}/operations`}
                actions={[{ value: 'CANCEL', label: 'Cancel unpaid order and release stock' }]}
              />
            )}
          {updatePermission.data && order.payment_status === 'PAID' && !refundRequest.data && (
            <AdminActionForm
              endpoint={`/api/admin/orders/${id}/operations`}
              actions={[{ value: 'REQUEST_REFUND', label: 'Request full refund review' }]}
            />
          )}
          {refundRequest.data && (
            <div className="space-y-3">
              <p className="text-sm font-bold">
                Refund: {refundRequest.data.status.replaceAll('_', ' ')}
              </p>
              <p className="whitespace-pre-wrap text-sm">{refundRequest.data.reason}</p>
              {refundPermission.data &&
                ['REQUESTED', 'UNDER_REVIEW'].includes(refundRequest.data.status) && (
                  <AdminActionForm
                    endpoint={`/api/admin/orders/${id}/operations`}
                    actions={
                      refundRequest.data.status === 'REQUESTED'
                        ? [{ value: 'START_REVIEW', label: 'Start finance review' }]
                        : [
                            { value: 'REJECT', label: 'Reject refund request' },
                            { value: 'RECORD_REFUND', label: 'Record verified external refund' },
                          ]
                    }
                    fields={
                      refundRequest.data.status === 'UNDER_REVIEW'
                        ? [
                            {
                              name: 'reference',
                              label: 'Verified external transfer reference (for record refund)',
                            },
                          ]
                        : []
                    }
                  />
                )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
