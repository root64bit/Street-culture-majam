import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  action: z.enum(['REQUEST_RETURN', 'CONFIRM_RETURN']),
  note: z.string().trim().min(10).max(1000),
});
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['consignments.review']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure('VALIDATION', 'Return action and reason are required.');
  const result = await access.supabase.rpc('return_consignment_item', {
    target_submission_id: id,
    return_action: body.data.action,
    operator_note: body.data.note,
  });
  if (result.error) return databaseFailure(result.error, 'consignment_return');
  return NextResponse.json({ status: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
