import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  consumeGuestCheckoutRateLimit,
  guestOrderCookieName,
  hashGuestOrderToken,
} from '@/lib/payments/guest-checkout';
import { shippingCountries } from '@/lib/shipping/countries';
import { shippingDestinationSchema, validDestinationRegion } from '@/lib/shipping/destination';
import { checkoutSessionCookie, checkoutSessionHash } from '@/lib/shipping/quote-session';
import { moneyMinor } from '@/lib/money';
import { checkoutSizesConfirmed } from '@/lib/commerce/checkout-sizes';
import { paymentProviderAllowed } from '@/lib/payments/provider-policy';

const requestSchema = shippingDestinationSchema.extend({
  checkout_id: z.string().uuid(),
  checkout_secret: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,25}$/)
    .refine((value) => {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15;
    }),
  address_line_1: z.string().trim().min(4).max(200),
  address_line_2: z.string().trim().max(200).optional().default(''),
  postal_code: z.string().trim().max(24).optional().default(''),
  delivery_notes: z.string().trim().max(500).optional().default(''),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  country: z
    .string()
    .refine((value) => shippingCountries.some((country) => country.code === value)),
  shipping_method_code: z.string().trim().min(2).max(50),
  shipping_quote_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        listingId: z.string().uuid(),
        size: z.string().trim().min(1).max(24),
        quantity: z.literal(1),
        displayedPrice: z
          .number()
          .positive()
          .refine((value) => {
            try {
              moneyMinor(value);
              return true;
            } catch {
              return false;
            }
          }),
      })
    )
    .min(1)
    .max(10),
});

function normalizeMozambiquePhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 9 ? `258${digits}` : digits;
}

function clientMessage(message: string) {
  if (/quote|retry does not match/i.test(message))
    return 'Your delivery quote expired or checkout details changed. Request a new quote before paying.';
  if (message.includes('no longer available') || message.includes('just reserved')) {
    return 'One of those pieces was just reserved. Refresh the shop and try again.';
  }
  if (message.includes('size is no longer available')) {
    return 'That size is no longer available. Refresh the product and choose another size.';
  }
  if (message.includes('single item')) {
    return 'This listing is a one-off piece and can only be purchased once.';
  }
  if (message.includes('price changed')) {
    return 'A price changed while this item was in your bag. Remove it and add it again to review the current price.';
  }
  if (message.includes('shipping method is unavailable')) {
    return 'That delivery method is not available for this address. Choose another option.';
  }
  if (message.includes('commission rule')) {
    return 'This piece cannot be checked out yet. Please contact the store.';
  }
  return 'We could not reserve these items. Refresh the shop and try again.';
}

export async function POST(request: Request) {
  if (
    !(paymentProviderAllowed('mpesa') && process.env.MPESA_PAYMENTS_ENABLED === 'true') &&
    !(paymentProviderAllowed('square') && process.env.SQUARE_PAYMENTS_ENABLED === 'true')
  ) {
    return NextResponse.json({ error: 'Checkout is not enabled for this store.' }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Checkout needs live inventory. Sample preview products cannot be purchased.' },
      { status: 400 }
    );
  }

  if (new Set(parsed.data.items.map((item) => item.listingId)).size !== parsed.data.items.length) {
    return NextResponse.json(
      { error: 'Remove duplicate pieces before checking out.' },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const browserSession = await createClient();
    const {
      data: { user },
    } = await browserSession.auth.getUser();
    const allowed = await consumeGuestCheckoutRateLimit(admin, request, 'create-order', 4);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please wait and try again.' },
        { status: 429 }
      );
    }

    const orderId = parsed.data.checkout_id;
    if (!validDestinationRegion(parsed.data))
      return NextResponse.json(
        { error: 'Confirm the province and postal code for South Africa.' },
        { status: 400 }
      );
    const orderNumber = `SC${randomBytes(4).toString('hex').toUpperCase()}`;
    const guestToken = parsed.data.checkout_secret;
    const guestTokenHash = hashGuestOrderToken(guestToken);
    const normalizedPhone =
      parsed.data.country === 'MZ'
        ? normalizeMozambiquePhone(parsed.data.phone)
        : parsed.data.phone.replace(/[^\d+]/g, '');

    const sessionHash = checkoutSessionHash((await cookies()).get(checkoutSessionCookie)?.value);
    if (!sessionHash)
      return NextResponse.json(
        { error: 'Request a delivery quote in this browser before checking out.' },
        { status: 401 }
      );
    if (!(await checkoutSizesConfirmed(admin, parsed.data.items)))
      return NextResponse.json(
        {
          error:
            'Confirm an available shoe size before ordering. Remove this item and choose an individually sized piece.',
        },
        { status: 409 }
      );
    /* Idempotency, ownership, quote consumption and payload equality are checked
       inside the same database transaction, not a racy preflight SELECT. */
    const { data, error } = await admin.rpc('create_quoted_checkout_order', {
      target_shipping_quote_id: parsed.data.shipping_quote_id,
      target_session_hash: sessionHash,
      target_order_id: orderId,
      target_order_number: orderNumber,
      target_access_token_hash: guestTokenHash,
      target_guest_name: parsed.data.name,
      target_guest_email: parsed.data.email.toLowerCase(),
      target_guest_phone: normalizedPhone,
      target_shipping_snapshot: {
        ...shippingDestinationSchema.parse(parsed.data),
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        phone: normalizedPhone,
        delivery_notes: parsed.data.delivery_notes,
      },
      target_shipping_method_code: parsed.data.shipping_method_code,
      target_user_id: user?.id,
      target_items: parsed.data.items.map((item) => ({
        listing_id: item.listingId,
        size: item.size,
        quantity: item.quantity,
        expected_price: item.displayedPrice,
      })),
    });

    if (error || !data?.[0]) {
      const safeMessage = error
        ? clientMessage(error.message)
        : 'We could not reserve these items. Refresh the shop and try again.';
      return NextResponse.json({ error: safeMessage }, { status: 409 });
    }

    const order = data[0];
    const response = NextResponse.json({
      orderId: order.created_order_id,
      orderNumber: order.created_order_number,
      subtotal: Number(order.created_subtotal),
      shipping: Number(order.created_shipping),
      total: Number(order.created_total),
      expiresAt: order.created_expires_at,
    });
    response.cookies.set({
      name: guestOrderCookieName(orderId),
      value: guestToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 90 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    // Do not log order contact details, access tokens, phone numbers, or payment data.
    if (error instanceof Error && error.message === 'Checkout rate limit is unavailable.') {
      return NextResponse.json(
        { error: 'Checkout is temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Checkout is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }
}
