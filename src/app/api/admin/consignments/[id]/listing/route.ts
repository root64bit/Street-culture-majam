import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  variantId: z.string().uuid(),
  price: z.number().finite().positive().max(9999999999.99),
  note: z.string().trim().min(10).max(1000),
});
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['consignments.review', 'inventory.manage']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure('VALIDATION', 'Matching variant, price and reason are required.');
  const variant = await access.supabase
    .from('product_variants')
    .select('product_id')
    .eq('id', body.data.variantId)
    .maybeSingle();
  if (!variant.data) return adminFailure('NOT_FOUND', 'Catalog variant not found.', 404);
  const result = await access.supabase.rpc('create_consignment_listing', {
    target_submission_id: id,
    target_product_id: variant.data.product_id,
    target_variant_id: body.data.variantId,
    selling_price: body.data.price,
    operator_note: body.data.note,
  });
  if (result.error) return databaseFailure(result.error, 'consignment_listing');
  return NextResponse.json({ id: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
