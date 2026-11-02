import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { courierQuoteSchema } from '@/lib/shipping/schemas';
import { CourierError, getInternetExpressRates } from '@/lib/shipping/internet-express';
import { consumeGuestCheckoutRateLimit } from '@/lib/payments/guest-checkout';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const access = await capabilityApiClient(['shipping.manage']);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const body = courierQuoteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: 'Enter a complete delivery address, parcel dimensions, weight and declared value.' },
      { status: 400 }
    );
  }
  try {
    const allowed = await consumeGuestCheckoutRateLimit(
      createAdminClient(),
      request,
      'admin-courier-quote',
      60
    );
    if (!allowed)
      return NextResponse.json(
        { error: 'Too many quote requests. Please try again later.' },
        { status: 429 }
      );
    const quote = await getInternetExpressRates(body.data);
    return NextResponse.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CourierError
            ? error.message
            : 'Delivery quotes are temporarily unavailable.',
      },
      {
        status: error instanceof CourierError ? error.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
