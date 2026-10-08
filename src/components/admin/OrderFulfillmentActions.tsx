import { AdminActionForm } from '@/components/admin/AdminActionForm';
export function OrderFulfillmentActions({
  orderId,
  status,
  fulfillment,
  payment,
  pickup = false,
}: {
  orderId: string;
  status: string;
  fulfillment: string;
  payment: string;
  pickup?: boolean;
}) {
  if (payment !== 'PAID') return null;
  const actions: { value: string; label: string }[] = [];
  if (status === 'CONFIRMED' && fulfillment === 'UNFULFILLED')
    actions.push({ value: 'START_PROCESSING', label: 'Start processing' });
  if (status === 'PROCESSING' && fulfillment === 'UNFULFILLED')
    actions.push({ value: 'MARK_PACKED', label: 'Mark packed' });
  if (['PROCESSING', 'PACKED'].includes(status) && fulfillment === 'PACKED')
    actions.push(
      pickup
        ? { value: 'MARK_READY_FOR_PICKUP', label: 'Mark ready for pickup' }
        : { value: 'MARK_SHIPPED', label: 'Mark shipped' }
    );
  if (
    ['SHIPPED', 'READY_FOR_PICKUP'].includes(status) &&
    ['SHIPPED', 'READY_FOR_PICKUP'].includes(fulfillment)
  )
    actions.push({
      value: 'MARK_DELIVERED',
      label: pickup ? 'Confirm collected' : 'Mark delivered',
    });
  if (!actions.length) return null;
  return (
    <section className="rounded-2xl border border-[#dce8d7] bg-[#eff7eb] p-5">
      <h2 className="mb-4 text-lg font-black">Next fulfillment step</h2>
      <AdminActionForm endpoint={`/api/admin/orders/${orderId}/fulfillment`} actions={actions} />
    </section>
  );
}
