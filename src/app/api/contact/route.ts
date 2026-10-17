import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeGuestCheckoutRateLimit } from '@/lib/payments/guest-checkout';

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional().default(''),
  topic: z.enum(['ORDER', 'RETURN', 'CONSIGNMENT', 'AUTHENTICITY', 'PRIVACY', 'OTHER']),
  orderNumber: z.string().trim().max(32).optional().default(''),
  message: z.string().trim().min(20).max(2000),
  website: z.string().max(0).optional().default(''),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Add your name, valid email and a message of at least 20 characters.' },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const allowed = await consumeGuestCheckoutRateLimit(admin, request, 'contact-request', 5);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many support requests. Please wait before trying again.' },
        { status: 429 }
      );
    }

    const { data: roles, error: roleError } = await admin
      .from('user_roles')
      .select('user_id')
      .in('role', ['SUPER_ADMIN', 'ADMIN', 'SUPPORT']);
    if (roleError) throw roleError;
    const recipients = [...new Set((roles ?? []).map((role) => role.user_id))];
    if (!recipients.length) {
      return NextResponse.json(
        { error: 'Support intake is temporarily unavailable.' },
        { status: 503 }
      );
    }

    const contact = parsed.data;
    const createdAt = new Date().toISOString();
    const rows = recipients.map((userId) => ({
      user_id: userId,
      type: 'CONTACT_REQUEST',
      title: `${contact.topic.replaceAll('_', ' ')} — ${contact.name}`,
      body: contact.message,
      metadata: {
        email: contact.email.toLowerCase(),
        phone: contact.phone || null,
        order_number: contact.orderNumber.toUpperCase() || null,
        topic: contact.topic,
        submitted_at: createdAt,
      },
    }));
    const { error } = await admin.from('notifications').insert(rows);
    if (error) throw error;

    return NextResponse.json(
      { received: true },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Support intake is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }
}
