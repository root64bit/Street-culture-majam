import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  action: z.enum([
    'ADJUST_PRICE',
    'DEACTIVATE',
    'ARCHIVE',
    'RESTORE_DRAFT',
    'ACTIVATE',
    'RELEASE_EXPIRED',
  ]),
  note: z.string().trim().min(10).max(1000),
  price: z.number().finite().positive().max(9999999999.99).optional(),
});
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['inventory.manage']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure('VALIDATION', 'Valid inventory action, price and reason required.');
  const result = await access.supabase.rpc('manage_inventory_listing', {
    target_listing_id: id,
    inventory_action: body.data.action,
    operator_note: body.data.note,
    ...(body.data.price ? { new_price: body.data.price } : {}),
  });
  if (result.error) return databaseFailure(result.error, 'inventory_transition');
  return NextResponse.json({ id: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
