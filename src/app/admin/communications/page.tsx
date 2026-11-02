import Link from 'next/link';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailIsConfigured } from '@/lib/communications/email';
import { ORDER_ADMIN_EMAIL, orderEmailEnabled } from '@/lib/notifications/order-email';
import { formatOrderTimestamp } from '@/lib/commerce/order-money';

export default async function CommunicationsPage() {
  await requireCapabilitiesPage('/admin/communications', ['settings.manage']);
  const db = createAdminClient();
  const [channels, messages, health, review] = await Promise.all([
    db.from('order_notification_channels').select('*').order('channel'),
    db
      .from('order_message_outbox')
      .select(
        'id,order_id,kind,channel,state,provider_status,created_at,updated_at,last_error,orders(order_number)'
      )
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('order_notification_worker_health').select('*').eq('id', true).single(),
    db
      .from('order_message_outbox')
      .select('id', { count: 'exact', head: true })
      .in('state', ['UNKNOWN', 'FAILED', 'UNDELIVERED']),
  ]);
  if (channels.error || messages.error || health.error || review.error)
    throw new Error('Order communication status is temporarily unavailable.');
  const labels: Record<string, string> = {
    CUSTOMER_EMAIL: 'Customer order emails',
    ADMIN_EMAIL: 'Admin purchase alerts',
    CUSTOMER_WHATSAPP: 'Automatic WhatsApp',
  };
  const completed = health.data.last_completed_at;
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
        Customer communications
      </p>
      <h1 className="mt-2 text-4xl font-black">Order emails and alerts</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
        Customer updates and a separate purchase alert to {ORDER_ADMIN_EMAIL} follow verified paid
        orders. Marketing has its own consent and approval process. No historical orders are
        automatically enrolled.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {channels.data.map((channel) => (
          <div key={channel.channel} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="font-bold">{labels[channel.channel]}</h2>
            <p className="mt-2 text-sm">
              {channel.channel === 'CUSTOMER_WHATSAPP'
                ? 'Not connected — manual support only'
                : channel.enabled && orderEmailEnabled() && emailIsConfigured()
                  ? 'Enabled for future orders'
                  : 'Paused / not activated'}
            </p>
            {channel.enabled_since && (
              <p className="mt-2 text-xs text-neutral-600">
                Eligible orders created from {formatOrderTimestamp(channel.enabled_since)}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl bg-neutral-100 p-5 text-sm leading-6 text-neutral-800">
        <p>
          Sender:{' '}
          {emailIsConfigured()
            ? 'Email credentials configured'
            : 'Email sender needs configuration'}{' '}
          · Worker: {orderEmailEnabled() ? 'Enabled' : 'Kill switch off'} · Needs review:{' '}
          {review.count ?? 0}
        </p>
        <p>
          Last completed worker run:{' '}
          {completed ? formatOrderTimestamp(completed) : 'No completed run recorded'}.
        </p>
        {health.data.last_failed_at && (
          <p>
            Last worker failure: {formatOrderTimestamp(health.data.last_failed_at)}. Check the queue
            before resending anything.
          </p>
        )}
        <p className="mt-2">
          Provider accepted does not mean inbox delivered. Unknown, failed and undelivered messages
          require review; they are never automatically resent. Guest order links still require the
          original checkout browser or the purchasing account.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/marketing"
          className="rounded-xl bg-black px-5 py-3 text-sm font-bold text-white"
        >
          Email campaigns and subscribers
        </Link>
        <Link
          href="/admin/fulfillment"
          className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-bold"
        >
          Fulfillment queue
        </Link>
      </div>
      <h2 className="mt-10 text-xl font-bold">Latest order messages</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="p-4">Order</th>
              <th className="p-4">Message</th>
              <th className="p-4">Channel</th>
              <th className="p-4">Delivery state</th>
              <th className="p-4">Last update</th>
            </tr>
          </thead>
          <tbody>
            {messages.data.map((message) => (
              <tr key={message.id} className="border-b border-neutral-100 align-top">
                <td className="p-4">
                  <Link href={`/admin/orders/${message.order_id}`} className="font-bold underline">
                    {message.orders?.order_number || 'Review order'}
                  </Link>
                </td>
                <td className="p-4">{message.kind.replaceAll('_', ' ').toLowerCase()}</td>
                <td className="p-4">{labels[message.channel]}</td>
                <td className="p-4">
                  <p className="font-semibold">{message.state}</p>
                  {message.provider_status && (
                    <p className="text-xs text-neutral-600">Provider: {message.provider_status}</p>
                  )}
                  {message.last_error && (
                    <p className="mt-1 max-w-xs text-xs text-red-800">{message.last_error}</p>
                  )}
                </td>
                <td className="whitespace-nowrap p-4">
                  {formatOrderTimestamp(message.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!messages.data.length && (
          <p className="p-8 text-sm text-neutral-600">
            No order messages yet. Future paid orders will appear here; this does not replay earlier
            purchases.
          </p>
        )}
      </div>
      <div className="mt-8 max-w-3xl rounded-2xl border border-neutral-200 p-5 text-sm leading-6 text-neutral-700">
        <h2 className="font-bold text-black">WhatsApp and marketing</h2>
        <p className="mt-2">
          Keep +27 66 548 8223 for manual support. Automatic WhatsApp is not enabled: it needs an
          approved business sender, approved utility templates, a messaging credential and explicit
          customer opt-in. Email newsletter consent does not authorize WhatsApp campaigns.
        </p>
        <p className="mt-2">
          Use Email campaigns to save a draft, review the subject and message, and approve each send
          to confirmed subscribers. Buying a product or receiving an order email never subscribes a
          customer.
        </p>
      </div>
    </section>
  );
}
