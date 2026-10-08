import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';

const schema = z.object({
  action: z.enum([
    'START_REVIEW',
    'REQUEST_INFO',
    'APPROVE',
    'REJECT',
    'AWAIT_ITEM',
    'MARK_RECEIVED',
    'SEND_TO_AUTH',
  ]),
  notes: z.string().trim().min(10).max(1000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Invalid submission ID.' }, { status: 400 });
  const access = await capabilityApiClient(['consignments.review']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: 'Choose an action and provide a reason of 10–1000 characters.' },
      { status: 400 }
    );
  const { data, error } = await access.supabase.rpc('transition_consignment', {
    target_submission_id: id,
    review_action: body.data.action,
    review_notes: body.data.notes,
  });
  if (error)
    return NextResponse.json(
      { error: 'The transition is not allowed for this submission state.' },
      { status: 409 }
    );
  return NextResponse.json({ status: data }, { headers: { 'Cache-Control': 'no-store' } });
}
