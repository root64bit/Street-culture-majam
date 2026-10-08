import { z } from 'zod';
import { NextResponse } from 'next/server';
import { capabilityApiClient } from '@/lib/admin/access';
import { adminFailure, databaseFailure } from '@/lib/admin/errors';
export async function POST(request: Request) {
  const access = await capabilityApiClient(['notifications.read']);
  if ('error' in access)
    return adminFailure('FORBIDDEN', access.error ?? 'Access denied.', access.status);
  const body = z
    .object({ ids: z.array(z.string().uuid()).min(1).max(50) })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return adminFailure('VALIDATION', 'Select up to 50 alerts.');
  const result = await access.supabase.rpc('mark_admin_notifications_read', {
    notification_ids: body.data.ids,
  });
  if (result.error) return databaseFailure(result.error, 'notification_read');
  return NextResponse.json({ changed: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
