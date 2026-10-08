import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reconcilePayment } from '@/lib/admin/payment.service';

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  const supplied = Buffer.from(request.headers.get('authorization') ?? '');
  if (
    !secret ||
    secret.length < 32 ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (process.env.MPESA_PAYMENTS_ENABLED !== 'true')
    return NextResponse.json(
      { skipped: 'M-Pesa is disabled.' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  const admin = createAdminClient();
  const age = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const recheck = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const queue = await admin
    .from('payments')
    .select('id')
    .eq('provider', 'mpesa')
    .in('status', ['PENDING', 'REQUIRES_ACTION', 'FAILED'])
    .not('provider_reference', 'is', null)
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .lt('created_at', age)
    .or(`last_reconciled_at.is.null,last_reconciled_at.lt.${recheck}`)
    .order('last_reconciled_at', { ascending: true, nullsFirst: true })
    .limit(6);
  if (queue.error)
    return NextResponse.json({ error: 'Reconciliation queue unavailable.' }, { status: 503 });
  let checked = 0;
  let failed = 0;
  // Two batches of three keep provider timeouts below the function deadline.
  for (let offset = 0; offset < (queue.data?.length ?? 0); offset += 3) {
    await Promise.all(
      (queue.data ?? []).slice(offset, offset + 3).map(async (payment) => {
        try {
          await reconcilePayment(payment.id, null);
          checked++;
        } catch {
          failed++;
          console.error(
            JSON.stringify({
              event: 'payment_reconciliation_failed',
              paymentId: payment.id,
              source: 'scheduled',
            })
          );
          await admin
            .from('payments')
            .update({
              last_reconciled_at: new Date().toISOString(),
              last_provider_status: 'UNKNOWN',
              reconciliation_needs_review: true,
            })
            .eq('id', payment.id);
          await admin
            .from('admin_audit_logs')
            .insert({
              action: 'RECONCILIATION_UNAVAILABLE',
              entity_type: 'payment',
              entity_id: payment.id,
              metadata: { source: 'scheduled' },
            });
        }
      })
    );
  }
  return NextResponse.json({ checked, failed }, { headers: { 'Cache-Control': 'no-store' } });
}
