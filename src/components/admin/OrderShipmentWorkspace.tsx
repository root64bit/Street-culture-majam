import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FulfillmentWorkspace } from './FulfillmentWorkspace';
import type { Json } from '@/types/database.types';
function record(value: Json | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export async function OrderShipmentWorkspace({
  orderId,
  address,
  quoteId,
  packed,
}: {
  orderId: string;
  address: Json;
  quoteId: string | null;
  packed: boolean;
}) {
  const supabase = await createClient();
  const checks = await Promise.all(
    ['shipping.read', 'shipping.prepare', 'shipping.book'].map((check_capability) =>
      supabase.rpc('has_capability', { check_capability })
    )
  );
  if (!checks[0].data) return null;
  const [{ data: job, error }, { data: messages }] = await Promise.all([
    supabase
      .from('fulfillment_jobs')
      .select('*')
      .eq('order_id', orderId)
      .eq('group_key', 'OUTBOUND')
      .maybeSingle(),
    supabase
      .from('order_message_outbox')
      .select('id,kind,state,created_at')
      .eq('order_id', orderId),
  ]);
  if (error)
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-sm">
        Fulfillment workspace requires its additive migration. No shipment has been booked by this
        screen.
      </p>
    );
  let origin = record(job?.origin_snapshot);
  if (!Object.keys(origin).length && quoteId) {
    const { data: quote } = await createAdminClient()
      .from('checkout_shipping_quotes')
      .select('provider_references')
      .eq('id', quoteId)
      .eq('consumed_order_id', orderId)
      .maybeSingle();
    const source = record(record(quote?.provider_references).collectionAddress as Json);
    origin = {
      address_line_1: source.street_address,
      local_area: source.local_area,
      city: source.city,
      province: source.zone,
      postal_code: source.code,
      country: source.country,
    };
  }
  return (
    <div className="space-y-4">
      <FulfillmentWorkspace
        key={`${job?.id}-${job?.revision}`}
        orderId={orderId}
        job={job}
        address={record(job?.address_snapshot ?? address)}
        origin={origin}
        packed={packed}
        canPrepare={checks[1].data === true}
        canBook={checks[2].data === true}
      />
      <section className="rounded-xl border bg-white p-4 text-sm">
        <h2 className="font-bold">Transactional email queue</h2>
        <p className="mt-2 text-neutral-600">
          Sending is off unless explicitly enabled. Accepted means queued by the email provider, not
          delivered to the inbox.
        </p>
        {messages?.map((message) => (
          <p className="mt-2" key={message.id}>
            {message.kind}: {message.state}
          </p>
        ))}
      </section>
    </div>
  );
}
