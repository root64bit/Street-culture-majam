import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  action: z.enum([
    'ADD_NOTE',
    'CANCEL',
    'REQUEST_REFUND',
    'START_REVIEW',
    'REJECT',
    'RECORD_REFUND',
  ]),
  note: z.string().trim().min(10).max(1000),
  reference: z.string().trim().max(100).optional(),
});
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure('VALIDATION', 'Valid order action and reason required.');
  const refund = ['START_REVIEW', 'REJECT', 'RECORD_REFUND'].includes(body.data.action);
  const access = await capabilityApiClient([refund ? 'payments.refund' : 'orders.update']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const result = refund
    ? await access.supabase.rpc('review_order_refund', {
        target_order_id: id,
        refund_action: body.data.action,
        operator_note: body.data.note,
        ...(body.data.reference ? { transfer_reference: body.data.reference } : {}),
      })
    : await access.supabase.rpc('operate_order', {
        target_order_id: id,
        order_action: body.data.action,
        operator_note: body.data.note,
      });
  if (result.error) return databaseFailure(result.error, 'order_operation');
  return NextResponse.json({ result: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
