import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { communicationsAdmin } from '@/lib/communications/store';
import { campaignEmail } from '@/lib/communications/newsletter';
import { emailIsConfigured, sendEmail } from '@/lib/communications/email';

export const maxDuration = 60;
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('draft'),
    subject: z.string().trim().min(3).max(150),
    body: z.string().trim().min(20).max(12000),
  }),
  z.object({ action: z.literal('send'), id: z.string().uuid(), confirmed: z.literal(true) }),
]);

export async function POST(request: Request) {
  const access = await capabilityApiClient(['settings.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  // Cookie-authenticated sending must originate from this site, never an embedded cross-site form.
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 65536)
    return new Response(null, { status: 413 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Enter a subject and message, or explicitly confirm sending.' },
      { status: 400 }
    );
  try {
    const admin = communicationsAdmin();
    if (parsed.data.action === 'draft') {
      const { data, error } = await admin
        .from('newsletter_campaigns')
        .insert({
          subject: parsed.data.subject,
          body: parsed.data.body,
          created_by: access.user.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return NextResponse.json({ id: data.id, message: 'Draft saved. No emails sent.' });
    }
    if (
      !emailIsConfigured() ||
      !process.env.MARKETING_POSTAL_ADDRESS ||
      !process.env.NEWSLETTER_SIGNING_SECRET
    )
      throw new Error('Email is not configured.');
    const id = parsed.data.id;
    const { data: campaign, error } = await admin
      .from('newsletter_campaigns')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !campaign)
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    if (campaign.status === 'sent')
      return NextResponse.json({ message: 'This campaign has already finished.' });
    const { data: recipients, error: claimError } = await admin.rpc('claim_newsletter_batch', {
      target_campaign_id: id,
    });
    if (claimError) throw claimError;
    let accepted = 0;
    for (const recipient of recipients || []) {
      // Respect an unsubscribe that arrived after the batch was claimed.
      const { data: current, error: lookupError } = await admin
        .from('newsletter_subscribers')
        .select('status')
        .eq('id', recipient.subscriber_id)
        .single();
      let operationId: string | null = null;
      if (!lookupError && current?.status === 'subscribed') {
        try {
          operationId = await sendEmail({
            to: recipient.email,
            subject: campaign.subject,
            ...campaignEmail(campaign.subject, campaign.body, recipient.subscriber_id),
            category: 'newsletter',
          });
          accepted++;
        } catch {
          /* Record the failure; never automatically resend an uncertain delivery. */
        }
      }
      const saved = await admin
        .from('newsletter_deliveries')
        .update({ status: operationId ? 'accepted' : 'failed', operation_id: operationId })
        .eq('campaign_id', id)
        .eq('subscriber_id', recipient.subscriber_id);
      if (saved.error) throw saved.error;
    }
    if (!recipients?.length) {
      const pending = await admin
        .from('newsletter_deliveries')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', id)
        .eq('status', 'pending');
      if (pending.error) throw pending.error;
      if (pending.count)
        return NextResponse.json({
          message:
            'A batch is still processing or needs review. Uncertain deliveries are not automatically resent.',
        });
      const completed = await admin
        .from('newsletter_campaigns')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', id);
      if (completed.error) throw completed.error;
      return NextResponse.json({
        message:
          'Campaign finished. Provider acceptance is not a delivery guarantee; review Twilio delivery logs for failures.',
      });
    }
    return NextResponse.json({
      message: `${accepted} of ${recipients.length} emails accepted by Twilio. Click Send next batch to continue or finish.`,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          'Could not complete this operation. Check campaign status before retrying; accepted emails will not be resent.',
      },
      { status: 503 }
    );
  }
}
