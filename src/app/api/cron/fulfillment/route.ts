import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { internetExpressBookingProvider, processApprovedBooking } from '@/lib/shipping/booking';
import { createAdminClient } from '@/lib/supabase/admin';
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ''}`),
    supplied = Buffer.from(request.headers.get('authorization') ?? '');
  if (
    !secret ||
    secret.length < 32 ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.FULFILLMENT_API_BOOKING_ENABLED !== 'true')
    return NextResponse.json({ skipped: 'API booking is disabled.' });
  if (!internetExpressBookingProvider.contractVerified)
    return NextResponse.json(
      {
        error:
          'Account-specific booking contract and idempotency behavior must be verified first. No courier request was sent.',
      },
      { status: 503 }
    );
  const db = createAdminClient();
  const { data: job, error } = await db
    .from('fulfillment_jobs')
    .select('id')
    .eq('state', 'READY')
    .not('approved_at', 'is', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Queue unavailable' }, { status: 503 });
  if (!job) return NextResponse.json({ empty: true });
  try {
    return NextResponse.json(
      await processApprovedBooking(db, internetExpressBookingProvider, job.id)
    );
  } catch {
    return NextResponse.json({ error: 'Check booking outcome before retrying.' }, { status: 503 });
  }
}
