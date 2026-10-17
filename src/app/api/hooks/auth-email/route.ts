import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { communicationsAdmin } from '@/lib/communications/store';
import { authEmailPayloadSchema, buildAuthEmails } from '@/lib/communications/auth-email';
import { sendEmail } from '@/lib/communications/email';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: { http_code: 503, message: 'Email delivery is not configured.' } },
      { status: 503 }
    );
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 65536) return new Response(null, { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 65536) return new Response(null, { status: 413 });

  let verified: unknown;
  try {
    verified = new Webhook(secret.replace(/^v1,/, '')).verify(body, {
      'webhook-id': request.headers.get('webhook-id') || '',
      'webhook-timestamp': request.headers.get('webhook-timestamp') || '',
      'webhook-signature': request.headers.get('webhook-signature') || '',
    });
  } catch {
    return NextResponse.json(
      { error: { http_code: 401, message: 'Invalid webhook signature.' } },
      { status: 401 }
    );
  }
  const parsed = authEmailPayloadSchema.safeParse(verified);
  if (!parsed.success)
    return NextResponse.json(
      { error: { http_code: 400, message: 'Invalid authentication email.' } },
      { status: 400 }
    );

  try {
    const admin = communicationsAdmin();
    const messages = buildAuthEmails(
      parsed.data,
      process.env.NEXT_PUBLIC_SITE_URL || 'https://www.streetculturevault.com'
    );
    for (let index = 0; index < messages.length; index++) {
      const eventId = `${request.headers.get('webhook-id')}:${index}`;
      const payloadHash = createHash('sha256').update(body).digest('hex');
      // This service-only table prevents a valid webhook replay from sending email twice.
      const { error: claimError } = await admin.from('auth_email_deliveries').insert({
        id: eventId,
        payload_hash: payloadHash,
        status: 'pending',
      });
      if (claimError?.code === '23505') {
        const { data: previous, error } = await admin
          .from('auth_email_deliveries')
          .select('status,payload_hash')
          .eq('id', eventId)
          .single();
        if (!error && previous?.status === 'accepted' && previous.payload_hash === payloadHash)
          continue;
        throw new Error('This email delivery is already being processed.');
      }
      if (claimError) throw new Error('Email delivery tracking is unavailable.');
      let accepted = false;
      try {
        const operationId = await sendEmail({ ...messages[index], category: 'authentication' });
        accepted = true;
        const { error } = await admin
          .from('auth_email_deliveries')
          .update({ status: 'accepted', operation_id: operationId })
          .eq('id', eventId);
        if (error) throw new Error('Email delivery tracking failed.');
      } catch (error) {
        if (!accepted)
          await admin
            .from('auth_email_deliveries')
            .delete()
            .eq('id', eventId)
            .eq('status', 'pending');
        throw error;
      }
    }
    return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Do not log the payload: it contains login codes and email addresses.
    return NextResponse.json(
      {
        error: {
          http_code: 503,
          message: 'Email delivery is temporarily unavailable. Please request another code.',
        },
      },
      { status: 503 }
    );
  }
}
