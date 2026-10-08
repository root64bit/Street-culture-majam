import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';

const schema = z.object({
  action: z.enum([
    'START_PROCESSING',
    'MARK_PACKED',
    'MARK_READY_FOR_PICKUP',
    'MARK_SHIPPED',
    'MARK_DELIVERED',
  ]),
  note: z.string().trim().min(10).max(1000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Invalid order ID.' }, { status: 400 });
  const access = await capabilityApiClient(['orders.update']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: 'Choose a fulfillment step and provide a note of 10–1000 characters.' },
      { status: 400 }
    );
  const { data, error } = await access.supabase.rpc('advance_order_fulfillment', {
    target_order_id: id,
    fulfillment_action: body.data.action,
    operator_note: body.data.note,
  });
  if (error)
    return NextResponse.json(
      { error: 'This order cannot move to that fulfillment state.' },
      { status: 409 }
    );
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
