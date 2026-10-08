import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('REORDER'), ids: z.array(z.string().uuid()).max(100) }),
  z.object({
    action: z.literal('ALT_TEXT'),
    mediaId: z.string().uuid(),
    altText: z.string().trim().min(1).max(300),
  }),
  z.object({ action: z.literal('REMOVE'), mediaId: z.string().uuid() }),
]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['media.manage']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success)
    return adminFailure('INVALID_INPUT', 'Check the photo details.', 400);
  const operation = parsed.data;
  if (operation.action === 'REORDER') {
    const result = await access.supabase.rpc('reorder_product_media', {
      target_product_id: id,
      ordered_media_ids: operation.ids,
    });
    if (result.error) return databaseFailure(result.error, 'media.reorder');
  } else {
    const query =
      operation.action === 'REMOVE'
        ? access.supabase.from('product_media').delete()
        : access.supabase.from('product_media').update({ alt_text: operation.altText });
    const result = await query
      .eq('product_id', id)
      .eq('id', operation.mediaId)
      .select('id')
      .maybeSingle();
    if (result.error) return databaseFailure(result.error, 'media.edit');
    if (!result.data) return adminFailure('NOT_FOUND', 'Photo not found.', 404);
  }
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
