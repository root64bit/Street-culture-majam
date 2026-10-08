import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  size: z.string().trim().min(1).max(24),
  sizeSystem: z.enum(['US', 'UK', 'EU', 'CM', 'STANDARD']),
  sku: z.string().trim().max(100),
  color: z.string().trim().max(100),
  priceOverride: z.number().finite().positive().max(9999999999.99).nullable(),
  active: z.boolean(),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  const access = await capabilityApiClient(['products.write']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id, variantId } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (
    !z.string().uuid().safeParse(id).success ||
    !z.string().uuid().safeParse(variantId).success ||
    !body.success
  )
    return adminFailure('VALIDATION', 'Valid variant details required.');
  const result = await access.supabase
    .from('product_variants')
    .update({
      size: body.data.size,
      size_system: body.data.sizeSystem,
      sku: body.data.sku || null,
      color: body.data.color || null,
      price_override: body.data.priceOverride,
      active: body.data.active,
    })
    .eq('id', variantId)
    .eq('product_id', id)
    .select('id')
    .maybeSingle();
  if (result.error) return databaseFailure(result.error, 'variant_update');
  if (!result.data) return adminFailure('NOT_FOUND', 'Variant not found.', 404);
  return NextResponse.json({ id: result.data.id });
}
