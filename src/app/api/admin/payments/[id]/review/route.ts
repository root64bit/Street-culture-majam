import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  action: z.enum(['FLAG', 'CLEAR']),
  note: z.string().trim().min(20).max(2000),
});
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['payments.reconcile']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure(
      'VALIDATION',
      'Provide a valid payment and review note (20–2000 characters).'
    );
  const result = await access.supabase.rpc('flag_payment_review', {
    target_payment_id: id,
    needs_review: body.data.action === 'FLAG',
    operator_note: body.data.note,
  });
  if (result.error) return databaseFailure(result.error, 'payment_review');
  return NextResponse.json({ success: true });
}
