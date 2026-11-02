import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { consumeGuestCheckoutRateLimit } from '@/lib/payments/guest-checkout';
import { checkoutParcels } from '@/lib/shipping/checkout';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  checkoutSessionCookie,
  checkoutSessionHash,
  newCheckoutSession,
} from '@/lib/shipping/quote-session';
import { shippingDestinationSchema, validDestinationRegion } from '@/lib/shipping/destination';
import { configuredMethodApplies, maputoDeliveryZone } from '@/lib/shipping/maputo-delivery';
import { getPortadorDiarioQuote, PortadorDiarioError } from '@/lib/shipping/portador-diario';

export const maxDuration = 75;

const schema = shippingDestinationSchema.extend({
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
  if (!validDestinationRegion(parsed.data))
    return NextResponse.json(
      { error: 'Confirm the province and postal code for South Africa.' },
      { status: 400 }
    );

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
      .select('listing_id, size, asking_price')
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

    const cookieStore = await cookies();
    const previousSession = cookieStore.get(checkoutSessionCookie)?.value;
    const session = checkoutSessionHash(previousSession) ? previousSession! : newCheckoutSession();
    const browser = await createClient();
    const {
      data: { user },
    } = await browser.auth.getUser();
    const destination = shippingDestinationSchema.parse(parsed.data);
    const localDelivery = maputoDeliveryZone(destination);
    const { data: configured, error: configuredError } = await admin
      .from('shipping_methods')
      .select('*')
      .eq('active', true)
      .eq('currency', 'MZN')
      .eq('country_code', destination.country);
    if (configuredError) throw configuredError;
    const methods: {
      code: string;
      name: string;
      description: string;
      price: number;
      currency: 'MZN';
      provider_price: number;
      provider_currency: 'ZAR' | 'MZN';
      estimated_min_days: number;
      estimated_max_days: number;
      source: 'configured' | 'portador_diario';
      methodId?: string;
      rate: number;
      rateUpdated: string;
      references: Record<string, unknown>;
      quoteId?: string;
      expiresAt?: string;
    }[] = (configured ?? [])
      .filter((method) => configuredMethodApplies(method, destination))
      .map((method) => ({
        code: method.code,
        name: method.name,
        description: localDelivery
          ? 'Store-arranged local delivery. Delivery timing will be confirmed by the store.'
          : '',
        price: Number(method.price),
        currency: 'MZN',
        provider_price: Number(method.price),
        provider_currency: 'MZN',
        estimated_min_days: method.estimated_min_days ?? 0,
        estimated_max_days: method.estimated_max_days ?? 0,
        source: 'configured',
        methodId: method.id,
        rate: 1,
        rateUpdated: new Date().toISOString(),
        references: {},
      }));
    const parcels = checkoutParcels(parsed.data.items.length);
    if (destination.country === 'MZ' && !localDelivery) {
      // Domestic stock ships from Maputo, never from the South African account.
      // The public Portador Diário calculator receives city IDs and weight only.
      const quote = await getPortadorDiarioQuote(
        destination.city,
        parcels.reduce((total, parcel) => total + parcel.submitted_weight_kg, 0)
      );
      methods.push({
        code: quote.code,
        name: quote.name,
        description:
          'National shipment from Maputo. Carrier estimate based on the displayed parcel weight; delivery timing confirmed by the store.',
        price: quote.price,
        currency: 'MZN',
        provider_price: quote.price,
        provider_currency: 'MZN',
        estimated_min_days: 0,
        estimated_max_days: 0,
        source: 'portador_diario',
        rate: 1,
        rateUpdated: quote.quotedAt,
        references: {
          origin: quote.from,
          destination: quote.to,
          weightKg: quote.weightKg,
          service: quote.service,
          quotedAt: quote.quotedAt,
        },
      });
    }
    for (const method of methods) {
      const result = await admin.rpc('issue_checkout_shipping_quote', {
        // PostgreSQL accepts NULL UUID inputs; generated RPC types do not model that nullability.
        target_session_hash: checkoutSessionHash(session)!,
        target_user_id: (user?.id ?? null) as unknown as string,
        target_destination: destination,
        target_items: parsed.data.items.map((item) => ({
          listing_id: item.listingId,
          size: item.size,
          quantity: 1,
          expected_price: Number(liveListings.get(item.listingId)!.asking_price),
        })),
        target_provider: method.source,
        target_service_code: method.code,
        target_service_name: method.name,
        target_shipping_method_id: (method.methodId ?? null) as unknown as string,
        target_parcels: method.source === 'configured' ? [] : parcels,
        target_provider_references: method.references as import('@/types/database.types').Json,
        target_provider_amount: method.provider_price,
        target_provider_currency: method.provider_currency,
        target_amount_mzn: method.price,
        target_exchange_rate: method.rate,
        target_exchange_updated_at: method.rateUpdated,
        target_min_days: method.estimated_min_days,
        target_max_days: method.estimated_max_days,
      });
      if (result.error || !result.data?.[0])
        throw new Error('Shipping quotation could not be saved.');
      method.quoteId = result.data[0].quote_id;
      method.expiresAt = result.data[0].quote_expires_at;
    }

    const response = NextResponse.json(
      {
        methods: methods.map(
          ({
            methodId: _methodId,
            rate: _rate,
            rateUpdated: _rateUpdated,
            references: _references,
            ...method
          }) => method
        ),
        quotedAt: new Date().toISOString(),
        parcelBasis: methods.some((method) => method.source === 'portador_diario')
          ? `Portador Diário weight basis: ${parcels.reduce((total, parcel) => total + parcel.submitted_weight_kg, 0)} kg total (${parcels[0]?.submitted_weight_kg} kg per item).`
          : '',
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
    response.cookies.set(checkoutSessionCookie, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7200,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof PortadorDiarioError
            ? error.message
            : 'Live delivery prices are temporarily unavailable. Please try again.',
      },
      {
        status: error instanceof PortadorDiarioError ? error.status : 503,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
