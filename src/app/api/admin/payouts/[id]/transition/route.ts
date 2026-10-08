import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';

const schema = z.object({
  action: z.enum(['APPROVE', 'MARK_PROCESSING', 'MARK_PAID', 'MARK_FAILED']),
  note: z.string().trim().min(10).max(1000),
  method: z.string().trim().max(50).optional(),
  reference: z.string().trim().max(100).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success)
    return adminFailure('VALIDATION', 'Invalid payout ID.', 400);
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return adminFailure('VALIDATION', 'Valid payout action and operator note required.', 400);
  if (
    body.data.action === 'MARK_PAID' &&
    ((body.data.method?.length ?? 0) < 2 || (body.data.reference?.length ?? 0) < 6)
  ) {
    return adminFailure(
      'VALIDATION',
      'Record the external payment method and transaction reference.',
      400
    );
  }
  const access = await capabilityApiClient([
    body.data.action === 'MARK_PAID' ? 'payouts.mark_paid' : 'payouts.approve',
  ]);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { data, error } = await access.supabase.rpc('transition_seller_payout', {
    target_payout_id: id,
    payout_action: body.data.action,
    operator_note: body.data.note,
    payout_method: body.data.method,
    payout_reference: body.data.reference,
  });
  if (error) return databaseFailure(error, 'payout_transition');
  return NextResponse.json({ status: data }, { headers: { 'Cache-Control': 'no-store' } });
}
