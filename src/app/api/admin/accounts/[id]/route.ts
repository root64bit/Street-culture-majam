import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('VERIFY_SELLER'),
    status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'UNVERIFIED']),
    note: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal('ADD_NOTE'),
    context: z.enum(['customer', 'seller']),
    note: z.string().trim().min(10).max(2000),
  }),
  z.object({
    action: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
    note: z.string().trim().min(10).max(1000),
  }),
]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure('VALIDATION', 'Account, action and reason are required.');
  const value = body.data;
  const access = await capabilityApiClient([
    value.action === 'ADD_NOTE' ? `${value.context}s.notes` : 'users.manage',
  ]);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const result =
    value.action === 'VERIFY_SELLER'
      ? await access.supabase.rpc('set_seller_verification', {
          target_account_id: id,
          target_status: value.status,
          operator_note: value.note,
        })
      : value.action === 'ADD_NOTE'
        ? await access.supabase.rpc('add_account_operator_note', {
            target_account_id: id,
            note_context: value.context,
            operator_note: value.note,
          })
        : await access.supabase.rpc('set_customer_account_status', {
            target_account_id: id,
            new_status: value.action,
            operator_note: value.note,
          });
  if (result.error) return databaseFailure(result.error, 'account_update');
  return NextResponse.json({ result: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
