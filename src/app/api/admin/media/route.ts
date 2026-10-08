import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
const schema = z.object({
  bucket: z.enum(['product-images', 'brand-assets', 'editorial-assets']),
  path: z
    .string()
    .min(1)
    .max(500)
    .refine((v) => !/(^\/|\.\.|:\/\/)/.test(v)),
});
export async function DELETE(request: Request) {
  const access = await capabilityApiClient(['media.manage']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return adminFailure('VALIDATION', 'Public bucket and storage path required.');
  const allowed = await access.supabase.rpc('public_asset_is_unused', {
    asset_bucket: body.data.bucket,
    asset_path: body.data.path,
  });
  if (allowed.error || !allowed.data)
    return adminFailure('IN_USE', 'Asset is attached to a product, brand or category.', 409);
  const result = await access.supabase.storage.from(body.data.bucket).remove([body.data.path]);
  if (result.error) return databaseFailure({ code: 'STORAGE_ERROR' }, 'delete_unused_media');
  // The audit RPC verifies media permission again; no user-supplied secret metadata.
  const audit = await access.supabase.rpc('record_media_removal', {
    asset_bucket: body.data.bucket,
    asset_path: body.data.path,
  });
  if (audit.error)
    console.error(
      JSON.stringify({ event: 'media_removal_audit_failed', databaseCode: audit.error.code })
    );
  return NextResponse.json({ deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
}
