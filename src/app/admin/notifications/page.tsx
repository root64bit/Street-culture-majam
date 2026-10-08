import Link from 'next/link';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { pageNumber } from '@/lib/admin/filters';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { MarkNotificationsRead } from '@/components/admin/MarkNotificationsRead';
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; unread?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/notifications', [
    'notifications.read',
  ]);
  const params = await searchParams;
  const page = pageNumber(params.page);
  const unread = params.unread === 'true';
  const pageSize = 30;
  const { data, error } = await supabase.rpc('admin_notification_inbox', {
    unread_only: unread,
    page_offset: (page - 1) * pageSize,
    page_limit: pageSize,
  });
  if (error) throw new Error('Operational inbox is temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#087456]">
        Operations / Inbox
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Needs attention</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Live operational events for your permissions. Read state is personal to your staff account.
      </p>
      <div className="mt-6 flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">
          <Link
            href="/admin/notifications"
            className="rounded-lg border border-[#dce6dc] bg-white px-4 py-2 text-xs font-bold"
          >
            All events
          </Link>
          <Link
            href="/admin/notifications?unread=true"
            className="rounded-lg border border-[#dce6dc] bg-white px-4 py-2 text-xs font-bold"
          >
            Unread only
          </Link>
        </div>
        <MarkNotificationsRead ids={data?.filter((v) => !v.read_at).map((v) => v.id) ?? []} />
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#dce6dc] bg-white">
        {data?.map((alert) => (
          <Link
            key={alert.id}
            href={alert.href}
            className="flex gap-4 border-b border-[#edf1ec] p-5 hover:bg-[#f7faf5]"
          >
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${alert.read_at ? 'bg-[#dce6dc]' : 'bg-[#087456]'}`}
            />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#087456]">
                {alert.type.replaceAll('_', ' ')}
              </p>
              <p className="mt-1 text-sm font-bold">{alert.title}</p>
              <p className="mt-1 text-xs text-[#718278]">
                {new Date(alert.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Maputo' })}
              </p>
            </div>
          </Link>
        ))}
        {!data?.length && (
          <p className="p-12 text-center text-sm text-[#61766b]">
            {unread
              ? 'No unread operational alerts.'
              : 'No operational events yet. Events appear as orders, reviews, imports and payouts change.'}
          </p>
        )}
        <AdminPagination
          basePath="/admin/notifications"
          page={page}
          count={data?.[0]?.total_count ?? 0}
          pageSize={pageSize}
          filters={{ unread: String(unread) }}
        />
      </div>
    </section>
  );
}
