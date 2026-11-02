import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['inventory.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const body = z
    .object({
      condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']),
      note: z.string().trim().min(10).max(1000),
    })
    .safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success)
    return NextResponse.json(
      { error: 'Choose a condition and add a reason (10–1000 characters).' },
      { status: 400 }
    );
  const result = await access.supabase.rpc('edit_draft_listing_condition', {
    target_listing_id: id,
    target_condition: body.data.condition,
    operator_note: body.data.note,
  });
  if (result.error)
    return NextResponse.json(
      {
        error:
          'Only unpublished own-stock drafts can change condition. Reserved/sold items are protected; consignment conditions use the inspection workflow.',
      },
      { status: 409 }
    );
  return NextResponse.json({ updated: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}
