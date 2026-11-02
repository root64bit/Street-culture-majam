import { privateOrderAccess } from '@/lib/commerce/private-order';
import { safeCourierTrackingUrl, shipmentLabels } from '@/lib/shipping/tracking';
import { DeliveryAddress } from './DeliveryAddress';
export async function OrderShipmentStatus({ orderId }: { orderId: string }) {
  const access = await privateOrderAccess(orderId);
  if (!access) return null;
  if (
    ['CANCELLED', 'REFUNDED'].includes(access.order.status) ||
    access.order.payment_status !== 'PAID'
  )
    return <p className="mt-4 text-sm">No active courier dispatch.</p>;
  const { data: job, error } = await access.admin
    .from('fulfillment_jobs')
    .select('state,provider_reference,tracking_url,updated_at,address_snapshot,revision')
    .eq('order_id', orderId)
    .eq('group_key', 'OUTBOUND')
    .maybeSingle();
  // An unapplied migration is an unavailable feature, not a false booking.
  if (error || !job)
    return (
      <p className="mt-4 text-sm text-neutral-700">
        Courier booking is not yet recorded. Our team will review your order before dispatch.
      </p>
    );
  const tracking = safeCourierTrackingUrl(job.tracking_url);
  return (
    <div className="mt-4 border-t border-neutral-300 pt-4 text-sm">
      <p className="font-bold">
        {shipmentLabels[job.state] ?? 'Our team is checking shipment status'}
      </p>
      {job.provider_reference && <p className="mt-2">Waybill: {job.provider_reference}</p>}
      {tracking && (
        <a
          className="mt-2 block font-semibold underline"
          href={tracking}
          target="_blank"
          rel="noopener noreferrer"
        >
          Track with Internet Express
        </a>
      )}
      <p className="mt-2 text-xs text-neutral-600">
        Updated{' '}
        {new Date(job.updated_at).toLocaleString('en-GB', { timeZone: 'Africa/Johannesburg' })} SAST
      </p>
      {job.revision > 1 && (
        <>
          <p className="mt-3 font-semibold">Confirmed fulfillment address</p>
          <DeliveryAddress address={job.address_snapshot as Record<string, unknown>} />
        </>
      )}
    </div>
  );
}
