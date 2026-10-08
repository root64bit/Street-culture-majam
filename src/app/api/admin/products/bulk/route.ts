import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum([
    'FEATURE',
    'UNFEATURE',
    'MOST_WANTED',
    'REMOVE_MOST_WANTED',
    'ARCHIVE',
    'RESTORE_DRAFT',
  ]),
  note: z.string().trim().min(10).max(1000),
});
export async function POST(request: Request) {
  const access = await capabilityApiClient(['products.write']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return adminFailure('VALIDATION', 'Select products, a catalog action and a reason.');
  const result = await access.supabase.rpc('bulk_product_operation', {
    product_ids: [...new Set(body.data.ids)],
    catalog_action: body.data.action,
    operator_note: body.data.note,
  });
  if (result.error) return databaseFailure(result.error, 'bulk_product_operation');
  return NextResponse.json({ changed: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
