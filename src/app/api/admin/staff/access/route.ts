import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
const schema = z.object({
  userId: z.string().uuid(),
  disable: z.boolean(),
  reason: z.string().trim().min(10).max(500),
});
export async function POST(request: Request) {
  const access = await capabilityApiClient(['users.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: 'Account, access state and reason are required.' },
      { status: 400 }
    );
  const { data, error } = await access.supabase.rpc('set_admin_access', {
    target_user_id: body.data.userId,
    disable_access: body.data.disable,
    reason: body.data.reason,
  });
  if (error)
    return NextResponse.json(
      { error: 'Access change rejected. The last active superadmin must remain enabled.' },
      { status: 409 }
    );
  return NextResponse.json({ changed: data }, { headers: { 'Cache-Control': 'no-store' } });
}
