import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeGuestCheckoutRateLimit } from '@/lib/payments/guest-checkout';
import { emailIsConfigured } from '@/lib/communications/email';
import { requestNewsletterSubscription } from '@/lib/communications/newsletter';

const schema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  consent: z.literal(true),
  website: z.string().max(0).optional().default(''),
});
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Enter a valid email and agree to receive marketing emails.' },
      { status: 400 }
    );
  if (!emailIsConfigured())
    return NextResponse.json(
      { error: 'Newsletter subscriptions are temporarily unavailable.' },
      { status: 503 }
    );
  try {
    if (
      !(await consumeGuestCheckoutRateLimit(
        createAdminClient(),
        request,
        'newsletter-subscribe',
        5
      ))
    )
      return NextResponse.json(
        { error: 'Please wait before requesting another subscription email.' },
        { status: 429 }
      );
    await requestNewsletterSubscription(parsed.data.email);
    return NextResponse.json(
      {
        message:
          'Check your inbox to confirm your subscription. If already subscribed, you’re all set.',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Could not send your confirmation email. Please try again later.' },
      { status: 503 }
    );
  }
}
