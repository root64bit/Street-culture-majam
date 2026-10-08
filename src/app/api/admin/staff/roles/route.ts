import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';

const schema = z.object({
  userId: z.string().uuid(),
  role: z.enum([
    'SUPER_ADMIN',
    'ADMIN',
    'OPERATIONS',
    'CATALOG_MANAGER',
    'AUTHENTICATOR',
    'FULFILLMENT',
    'FINANCE',
    'SUPPORT',
    'STAFF',
  ]),
  grant: z.boolean(),
  reason: z.string().trim().min(10).max(500),
});

export async function POST(request: Request) {
  const access = await capabilityApiClient(['roles.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: 'A valid account, role, action and reason are required.' },
      { status: 400 }
    );
  const { data, error } = await access.supabase.rpc('set_staff_role', {
    target_user_id: body.data.userId,
    target_role: body.data.role,
    grant_role: body.data.grant,
    reason: body.data.reason,
  });
  if (error)
    return NextResponse.json(
      { error: 'Role change was rejected. The last superadmin cannot be removed.' },
      { status: 409 }
    );
  return NextResponse.json({ changed: data }, { headers: { 'Cache-Control': 'no-store' } });
}
