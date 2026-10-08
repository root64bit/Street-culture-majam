import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  metaTitle: z.string().trim().max(160),
  metaDescription: z.string().trim().max(320),
  retailPrice: z.number().finite().positive().max(9999999999.99).nullable(),
});
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['products.write']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure('VALIDATION', 'Check the slug, metadata length and price.');
  const result = await access.supabase
    .from('products')
    .update({
      slug: body.data.slug,
      meta_title: body.data.metaTitle || null,
      meta_description: body.data.metaDescription || null,
      retail_price: body.data.retailPrice,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (result.error) return databaseFailure(result.error, 'product_metadata');
  if (!result.data) return adminFailure('NOT_FOUND', 'Product not found.', 404);
  return NextResponse.json({ id: result.data.id });
}
