import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchMznExchangeRates } from '@/lib/currency';
import { consumeGuestCheckoutRateLimit } from '@/lib/payments/guest-checkout';
import { checkoutParcels, checkoutShippingMethods } from '@/lib/shipping/checkout';
import { CourierError, getInternetExpressRates } from '@/lib/shipping/internet-express';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  address_line_1: z.string().trim().min(4).max(160),
  address_line_2: z.string().trim().max(80).optional().default(''),
  local_area: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().min(2).max(16),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  address_type: z.enum(['residential', 'business']).default('residential'),
  items: z
    .array(
      z.object({
        listingId: z.string().uuid(),
        size: z.string().trim().min(1).max(24),
      })
    )
    .min(1)
    .max(10),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Enter a complete delivery address, including suburb and postal code.' },
      { status: 400 }
    );
  }
  if (new Set(parsed.data.items.map((item) => item.listingId)).size !== parsed.data.items.length) {
    return NextResponse.json(
      { error: 'Remove duplicate pieces before requesting delivery.' },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const allowed = await consumeGuestCheckoutRateLimit(
      admin,
      request,
      'customer-courier-quote',
      40
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many delivery quote requests. Please wait and try again.' },
        { status: 429 }
      );
    }

    const { data: listings, error: listingError } = await admin
      .from('public_catalog_listings')
      .select('listing_id, size')
      .in(
        'listing_id',
        parsed.data.items.map((item) => item.listingId)
      );
    if (listingError) throw listingError;
    const liveListings = new Map((listings ?? []).map((item) => [item.listing_id, item]));
    if (
      parsed.data.items.some(
        (item) =>
          !liveListings.has(item.listingId) || liveListings.get(item.listingId)?.size !== item.size
      )
    ) {
      return NextResponse.json(
        { error: 'One of these pieces is no longer available. Refresh your bag.' },
        { status: 409 }
      );
    }

    const streetAddress = [parsed.data.address_line_1, parsed.data.address_line_2]
      .filter(Boolean)
      .join(', ');
    const [quote, exchange] = await Promise.all([
      getInternetExpressRates({
        delivery_address: {
          type: parsed.data.address_type,
          company: '',
          street_address: streetAddress,
          local_area: parsed.data.local_area,
          city: parsed.data.city,
          zone: parsed.data.province,
          country: parsed.data.country,
          code: parsed.data.postal_code,
        },
        parcels: checkoutParcels(parsed.data.items.length),
      }),
      fetchMznExchangeRates(),
    ]);
    const methods = checkoutShippingMethods(quote.rates, exchange.rates, parsed.data.country);

    return NextResponse.json(
      {
        methods,
        quotedAt: quote.quotedAt,
        exchangeUpdatedAt: exchange.updatedAt,
        parcelBasis: 'Each item is quoted as one standard 35 × 25 × 15 cm, 2 kg parcel.',
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CourierError
            ? error.message
            : 'Live delivery prices are temporarily unavailable. Please try again.',
      },
      {
        status: error instanceof CourierError ? error.status : 503,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
