import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CircleAlert, Clock3, Package, Wallet } from 'lucide-react';
import { requireCapabilitiesPage } from '@/lib/admin/access';

type Metrics = Record<string, number | null>;

const metricGroups = [
  {
    label: 'Commerce',
    items: [
      ['Revenue today', 'revenueToday', 'currency'],
      ['Revenue this month', 'revenueMonth', 'currency'],
      ['Orders today', 'ordersToday', 'number'],
      ['Pending orders', 'pendingOrders', 'number'],
    ],
  },
  {
    label: 'Inventory',
    items: [
      ['Live listings', 'liveListings', 'number'],
      ['Reserved', 'reservedListings', 'number'],
      ['Sold', 'soldListings', 'number'],
      ['One unit left', 'oneUnitLeft', 'number'],
    ],
  },
  {
    label: 'Queues',
    items: [
      ['Consignments', 'pendingConsignments', 'number'],
      ['Authentication', 'authenticationQueue', 'number'],
      ['Payouts', 'pendingPayouts', 'number'],
      ['Import failures', 'importFailures', 'number'],
    ],
  },
] as const;

function formatMetric(value: number, kind: 'currency' | 'number') {
  if (kind === 'currency')
    return new Intl.NumberFormat('pt-MZ', {
      style: 'currency',
      currency: 'MZN',
      maximumFractionDigits: 0,
    }).format(value);
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Africa/Maputo',
  }).format(new Date(value));
}

function Status({ value }: { value: string }) {
  const isProblem = ['FAILED', 'CANCELLED', 'EXPIRED'].includes(value);
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${isProblem ? 'bg-red-50 text-red-700' : 'bg-[#eef7f1] text-[#126347]'}`}
    >
      {value.replaceAll('_', ' ')}
    </span>
  );
}

export default async function AdminDashboardPage() {
  const { supabase, user } = await requireCapabilitiesPage('/admin', ['dashboard.read']);
  const capabilities = await supabase.rpc('my_capabilities');
  if (capabilities.error) throw new Error('Admin permissions are temporarily unavailable.');
  const allowed = new Set((capabilities.data ?? []).map((entry) => entry.capability));
  const [metricsResult, ordersResult, paymentsResult, consignmentsResult] = await Promise.all([
    supabase.rpc('admin_dashboard_metrics'),
    allowed.has('orders.read')
      ? supabase
          .from('orders')
          .select('id,order_number,total_amount,currency,status,payment_status,created_at')
          .order('created_at', { ascending: false })
          .limit(6)
      : null,
    allowed.has('payments.read')
      ? supabase
          .from('payments')
          .select('id,order_id,amount,currency,status,provider,created_at')
          .order('created_at', { ascending: false })
          .limit(6)
      : null,
    allowed.has('consignments.read')
      ? supabase
          .from('consignment_submissions')
          .select('id,product_name,status,created_at')
          .order('created_at', { ascending: false })
          .limit(5)
      : null,
  ]);
  if (
    metricsResult.error ||
    ordersResult?.error ||
    paymentsResult?.error ||
    consignmentsResult?.error
  ) {
    throw new Error('Admin dashboard data is temporarily unavailable.');
  }
  const metrics = metricsResult.data as Metrics;
  const alerts = [
    { label: 'Failed payments', count: metrics.failedPayments, icon: Wallet },
    { label: 'Stale payment requests', count: metrics.stalePayments, icon: Clock3 },
    { label: 'Paid orders cancelled', count: metrics.paidRequiresReview, icon: CircleAlert },
    { label: 'Draft listings', count: metrics.draftListings, icon: Package },
  ].filter((item) => item.count !== null && item.count !== undefined);

  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
            Live operations
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.055em] sm:text-5xl">
            The whole picture.
          </h1>
          <p className="mt-2 text-sm text-[#61766b]">
            Your permissions determine which figures appear. All figures are read from the database.
          </p>
        </div>
        {allowed.has('products.write') && (
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-2 rounded-full bg-[#c6ff00] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#12241b] hover:bg-[#b3e700]"
          >
            Add a product <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="mt-8 space-y-7">
        {metricGroups.map((group) => {
          const visible = group.items.filter(
            ([, key]) => metrics[key] !== null && metrics[key] !== undefined
          );
          if (!visible.length) return null;
          return (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#61766b]">
                {group.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {visible.map(([label, key, kind]) => (
                  <div
                    key={key}
                    className="min-w-0 rounded-2xl border border-[#e0e9e1] bg-white p-5 shadow-[0_7px_28px_rgba(15,38,25,.035)]"
                  >
                    <p className="text-xs font-semibold text-[#66786f]">{label}</p>
                    <p className="mt-3 truncate text-3xl font-black tabular-nums tracking-[-0.05em] text-[#13281d]">
                      {formatMetric(Number(metrics[key]), kind)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-9 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        {ordersResult && (
          <section className="overflow-hidden rounded-2xl border border-[#e0e9e1] bg-white">
            <div className="flex items-center justify-between border-b border-[#edf1ec] p-5">
              <div>
                <h2 className="text-lg font-black">Recent orders</h2>
                <p className="text-xs text-[#718278]">Newest order activity</p>
              </div>
              <span className="text-xs font-bold text-[#087456]">Last 6</span>
            </div>
            {ordersResult.data?.length ? (
              <div className="divide-y divide-[#edf1ec]">
                {ordersResult.data.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5"
                  >
                    <div>
                      <p className="text-sm font-bold">{order.order_number}</p>
                      <p className="mt-1 text-xs text-[#718278]">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Status value={order.status} />
                      <span className="text-sm font-black tabular-nums">
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: order.currency,
                        }).format(order.total_amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-[#718278]">No orders have been placed yet.</p>
            )}
          </section>
        )}
        <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
          <h2 className="text-lg font-black">Requires attention</h2>
          <p className="mt-1 text-xs text-[#718278]">Queues that need an operator</p>
          <div className="mt-5 space-y-2">
            {alerts.length ? (
              alerts.map(({ label, count, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl bg-[#f4f7f3] px-4 py-3"
                >
                  <span className="flex items-center gap-3 text-sm font-semibold">
                    <Icon className="h-4 w-4 text-[#087456]" />
                    {label}
                  </span>
                  <strong className={Number(count) > 0 ? 'text-[#a2472b]' : 'text-[#708178]'}>
                    {count}
                  </strong>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#718278]">No queues are available to your role.</p>
            )}
          </div>
          {allowed.has('products.read') && (
            <Link
              href="/admin/products"
              className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#087456]"
            >
              Open catalog <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {paymentsResult && (
          <section className="overflow-hidden rounded-2xl border border-[#e0e9e1] bg-white">
            <h2 className="border-b border-[#edf1ec] p-5 text-lg font-black">Recent payments</h2>
            {paymentsResult.data?.length ? (
              <div className="divide-y divide-[#edf1ec]">
                {paymentsResult.data.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 p-4 sm:px-5"
                  >
                    <div>
                      <p className="text-sm font-bold">{payment.provider}</p>
                      <p className="mt-1 text-xs text-[#718278]">
                        {formatDate(payment.created_at)}
                      </p>
                    </div>
                    <Status value={payment.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-[#718278]">No payment attempts yet.</p>
            )}
          </section>
        )}
        {consignmentsResult && (
          <section className="overflow-hidden rounded-2xl border border-[#e0e9e1] bg-white">
            <h2 className="border-b border-[#edf1ec] p-5 text-lg font-black">
              Recent consignments
            </h2>
            {consignmentsResult.data?.length ? (
              <div className="divide-y divide-[#edf1ec]">
                {consignmentsResult.data.map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between gap-3 p-4 sm:px-5"
                  >
                    <div>
                      <p className="line-clamp-1 text-sm font-bold">{submission.product_name}</p>
                      <p className="mt-1 text-xs text-[#718278]">
                        {formatDate(submission.created_at)}
                      </p>
                    </div>
                    <Status value={submission.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-[#718278]">No consignments submitted yet.</p>
            )}
          </section>
        )}
      </div>
      <p className="mt-8 text-[11px] text-[#839188]">
        Signed in as {user.email}. Revenue reflects succeeded MZN payment records, not estimates in
        other currencies.
      </p>
    </section>
  );
}
