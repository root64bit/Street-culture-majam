import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { inventoryCostInputSchema } from '@/lib/finance/inventory-cost';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['finance.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const parsed = z
    .object({ expectedRevision: z.number().int().nonnegative(), cost: inventoryCostInputSchema })
    .safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success)
    return NextResponse.json(
      { error: 'Check the cost, currency, historical conversion and evidence reference.' },
      { status: 400 }
    );
  const { data, error } = await access.supabase.rpc('set_inventory_cost_price', {
    target_listing_id: id,
    expected_revision: parsed.data.expectedRevision,
    target_cost: parsed.data.cost,
  });
  if (error)
    return NextResponse.json(
      {
        error: error.message.includes('refresh')
          ? 'Another staff member changed this cost. Refresh before editing.'
          : 'Cost was not updated. Only available store-owned units may change; sold or reserved items use order finance corrections.',
      },
      { status: 409 }
    );
  return NextResponse.json({ cost: data });
}
