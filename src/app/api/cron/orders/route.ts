import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendNextOrderEmail,
  reconcileNextOrderEmail,
  orderEmailEnabled,
} from '@/lib/notifications/order-email';
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.ORDER_NOTIFICATION_WORKER_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ''}`),
    supplied = Buffer.from(request.headers.get('authorization') ?? '');
  if (
    !secret ||
    secret.length < 32 ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  if (!orderEmailEnabled())
    return NextResponse.json(
      { skipped: 'Order email is disabled.' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  try {
    const db = createAdminClient();
    const started = await db
      .from('order_notification_worker_health')
      .update({ last_started_at: new Date().toISOString() })
      .eq('id', true);
    if (started.error) throw new Error('Worker health unavailable');
    // Bounded batches, separate leases and atomic event deduplication. The DB
    // scheduler can retry this endpoint safely, never the underlying uncertain POST.
    const results = [];
    for (let index = 0; index < 3; index++) {
      results.push(
        await Promise.allSettled(
          (['CUSTOMER_EMAIL', 'ADMIN_EMAIL'] as const).map((channel) =>
            sendNextOrderEmail(db, undefined, channel)
          )
        )
      );
    }
    const receipts = await Promise.allSettled(
      (['CUSTOMER_EMAIL', 'ADMIN_EMAIL'] as const).map((channel) =>
        reconcileNextOrderEmail(db, channel)
      )
    );
    if ([...results.flat(), ...receipts].some((result) => result.status === 'rejected'))
      throw new Error('One or more notifications require review');
    const completed = await db
      .from('order_notification_worker_health')
      .update({ last_completed_at: new Date().toISOString() })
      .eq('id', true);
    if (completed.error) throw new Error('Worker health recording unavailable');
    return NextResponse.json(
      { results, receipts },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch {
    await createAdminClient()
      .from('order_notification_worker_health')
      .update({ last_failed_at: new Date().toISOString() })
      .eq('id', true);
    return NextResponse.json(
      { error: 'Order email queue needs review. No automatic resend.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export const GET = POST;
