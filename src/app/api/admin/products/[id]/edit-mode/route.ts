import { NextResponse } from 'next/server';
import { z } from 'zod';
import { capabilityApiClient } from '@/lib/admin/access';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await capabilityApiClient(['products.write', 'inventory.manage']);
  if ('error' in access)
    return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const parsed = z
    .object({ note: z.string().trim().min(10).max(1000) })
    .safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success)
    return NextResponse.json(
      { error: 'Choose a product and provide an editing reason.' },
      { status: 400 }
    );
  const result = await access.supabase.rpc('prepare_product_for_editing', {
    target_product_id: id,
    operator_note: parsed.data.note,
  });
  if (result.error) {
    const message = /reservation/i.test(result.error.message)
      ? 'This product has an active customer reservation. Finish or safely cancel that checkout before editing.'
      : 'Could not prepare this product for editing. Check your permissions and refresh the product.';
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return NextResponse.json(
    { unpublished: result.data },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
