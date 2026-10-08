import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z
  .object({
    system: z.enum(['US', 'UK', 'EU', 'CM', 'ONE_SIZE']),
    start: z.number().min(0).max(100),
    end: z.number().min(0).max(100),
    increment: z.union([z.literal(0.5), z.literal(1)]),
    skuPrefix: z.string().trim().max(70),
    color: z.string().trim().max(100),
  })
  .refine((v) => v.end >= v.start && (v.end - v.start) / v.increment <= 100);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['products.write']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return adminFailure('VALIDATION', 'Enter a valid size range (up to 101 variants).');
  const result = await access.supabase.rpc('generate_product_size_range', {
    target_product_id: id,
    target_system: body.data.system,
    start_size: body.data.start,
    end_size: body.data.end,
    size_increment: body.data.increment,
    sku_prefix: body.data.skuPrefix,
    variant_color: body.data.color,
  });
  if (result.error) return databaseFailure(result.error, 'variant_generation');
  return NextResponse.json({ created: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
