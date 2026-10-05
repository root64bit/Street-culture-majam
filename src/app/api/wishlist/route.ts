import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('merge'), productIds: z.array(uuid).max(100) }),
  z.object({ action: z.literal('add'), productId: uuid }),
  z.object({ action: z.literal('remove'), productId: uuid }),
]);

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ authenticated: false, productIds: [] }, { headers: noStore });
    }

    const { data, error } = await supabase.from('wishlist_items')
      .select('product_id').eq('user_id', user.id);
    if (error) throw error;
    return NextResponse.json({ authenticated: true, productIds: [...new Set((data ?? []).map((item) => item.product_id))] }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Wishlist is temporarily unavailable.' }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid wishlist request.' }, { status: 400, headers: noStore });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Sign in to save a wishlist.' }, { status: 401, headers: noStore });
    }

    const { action } = parsed.data;
    if (action === 'merge' || action === 'add') {
      const productIds = action === 'merge' ? [...new Set(parsed.data.productIds)] : [parsed.data.productId];
      if (productIds.length) {
        const { error } = await supabase.from('wishlist_items').upsert(
          productIds.map((productId) => ({ user_id: user.id, product_id: productId, variant_id: null })),
          { onConflict: 'user_id,product_id,variant_id', ignoreDuplicates: true },
        );
        if (error) throw error;
      }
    } else {
      const { error } = await supabase.from('wishlist_items').delete()
        .eq('user_id', user.id).eq('product_id', parsed.data.productId).is('variant_id', null);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Wishlist could not be updated.' }, { status: 503, headers: noStore });
  }
}
