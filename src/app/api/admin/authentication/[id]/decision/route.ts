import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';

const schema = z.object({
  action: z.enum(['START', 'PASS', 'FAIL', 'REQUEST_INFO']),
  note: z.string().trim().min(10).max(2000),
  condition: z.string().trim().max(100).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Invalid review ID.' }, { status: 400 });
  const access = await capabilityApiClient(['authentication.review']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success || (body.data.action === 'PASS' && (body.data.condition?.length ?? 0) < 2)) {
    return NextResponse.json(
      { error: 'Provide an inspection note and a confirmed condition for a pass.' },
      { status: 400 }
    );
  }
  const { data, error } = await access.supabase.rpc('decide_consignment_authentication', {
    target_record_id: id,
    auth_action: body.data.action,
    decision_note: body.data.note,
    confirmed_condition: body.data.condition,
  });
  if (error)
    return NextResponse.json(
      { error: 'This authentication decision is not valid for the current state.' },
      { status: 409 }
    );
  return NextResponse.json({ status: data }, { headers: { 'Cache-Control': 'no-store' } });
}
