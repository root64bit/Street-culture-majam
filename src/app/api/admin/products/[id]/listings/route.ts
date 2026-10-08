import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';
import { inventoryDraftSchema } from '@/lib/schemas/admin-inventory.schema';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['inventory.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid product ID.' }, { status: 400 });
  }
  const parsed = inventoryDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the item details.' },
      { status: 400 }
    );
  }

  const item = parsed.data;
  const { data: listingId, error } = await access.supabase.rpc('create_staff_inventory_draft', {
    target_product_id: id,
    target_size: item.size,
    target_size_system: item.sizeSystem,
    target_condition: item.condition,
    target_asking_price: item.askingPrice,
  });
  if (error?.message.includes('Unpublished product draft not found')) {
    return NextResponse.json({ error: 'Unpublished product draft not found.' }, { status: 404 });
  }
  if (error || !listingId) {
    return NextResponse.json({ error: 'Could not save the inventory draft.' }, { status: 500 });
  }
  return NextResponse.json({ listingId }, { status: 201 });
}
