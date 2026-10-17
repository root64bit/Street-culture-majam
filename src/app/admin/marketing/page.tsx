import { requireCapabilitiesPage } from '@/lib/admin/access';
import { communicationsAdmin } from '@/lib/communications/store';
import { CampaignManager } from '@/components/marketing/CampaignManager';

export default async function MarketingPage() {
  await requireCapabilitiesPage('/admin/marketing', ['settings.manage']);
  const admin = communicationsAdmin();
  const [campaigns, subscribers, accepted, failed, pending] = await Promise.all([
    admin
      .from('newsletter_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'subscribed'),
    admin
      .from('newsletter_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted'),
    admin
      .from('newsletter_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed'),
    admin
      .from('newsletter_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);
  if ([campaigns, subscribers, accepted, failed, pending].some((result) => result.error))
    throw new Error('Marketing is temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <h1 className="text-4xl font-black">Email marketing</h1>
      <p className="mt-3 text-sm text-neutral-600">
        {subscribers.count || 0} confirmed subscribers · {accepted.count || 0} provider-accepted
        emails · {failed.count || 0} failed/skipped · {pending.count || 0} processing/uncertain.
      </p>
      <p className="mt-2 text-sm text-neutral-600">
        Only customers who separately confirm newsletter consent receive campaigns. Account creation
        never automatically subscribes customers. Review uncertain sends in Twilio before taking
        further action.
      </p>
      <CampaignManager campaigns={campaigns.data || []} />
    </section>
  );
}
