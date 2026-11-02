import Link from 'next/link';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { shipmentLabels } from '@/lib/shipping/tracking';
export default async function FulfillmentPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/fulfillment', ['shipping.read']);
  const { state } = await searchParams;
  let query = supabase
    .from('fulfillment_jobs')
    .select(
      'id,order_id,state,updated_at,provider_reference,last_error,orders(order_number,status,payment_status)'
    )
    .order('updated_at', { ascending: true })
    .limit(100);
  if (state && shipmentLabels[state]) query = query.eq('state', state);
  const { data: jobs, error } = await query;
  return (
    <section className="space-y-6 px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <h1 className="text-4xl font-black">Fulfillment queue</h1>
      <p className="text-sm text-neutral-600">
        New paid courier orders create review drafts, not courier bookings. Historical orders
        require explicit preparation from the order workspace. API booking and tracking sync remain
        disabled pending provider contract verification.
      </p>
      <form className="flex gap-3">
        <label className="text-xs">
          Shipment state
          <select
            name="state"
            defaultValue={state || ''}
            className="mt-1 block rounded-lg border bg-white p-2"
          >
            <option value="">All states</option>
            {Object.entries(shipmentLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="self-end rounded-lg bg-black px-4 py-2 text-white">Filter</button>
      </form>
      {error ? (
        <p role="alert">Fulfillment data is unavailable. Apply its additive migration first.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr>
                {['Order', 'Next step / state', 'Waybill', 'Last update', 'Attention'].map((v) => (
                  <th key={v} className="p-4">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs?.map((job) => (
                <tr key={job.id} className="border-t">
                  <td className="p-4">
                    <Link className="font-bold underline" href={`/admin/orders/${job.order_id}`}>
                      {job.orders?.order_number ?? 'Open order'}
                    </Link>
                  </td>
                  <td className="p-4">{shipmentLabels[job.state]}</td>
                  <td className="p-4">
                    {job.provider_reference ??
                      (['BOOKING_PENDING', 'BOOKING_UNKNOWN'].includes(job.state)
                        ? 'Confirmation pending'
                        : 'Not booked')}
                  </td>
                  <td className="p-4">
                    {new Date(job.updated_at).toLocaleString('en-GB', {
                      timeZone: 'Africa/Johannesburg',
                    })}{' '}
                    SAST
                  </td>
                  <td className="p-4 text-amber-900">
                    {job.last_error ??
                      (Date.now() - Date.parse(job.updated_at) > 86400000
                        ? 'No update for more than 24 hours'
                        : '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-neutral-600">
        Showing up to 100 oldest matching jobs. Booking and collection are separate from physical
        handover and delivery.
      </p>
    </section>
  );
}
