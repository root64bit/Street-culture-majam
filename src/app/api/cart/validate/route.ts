import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  items: z.array(z.object({
    listingId: z.string().uuid(),
    size: z.string().min(1).max(24),
    displayedPrice: z.number().nonnegative(),
  })).max(20),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid cart.' }, { status: 400 });
  if (parsed.data.items.length === 0) return NextResponse.json({ items: [] });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('public_catalog_listings')
      .select('listing_id, asking_price, size')
      .in('listing_id', parsed.data.items.map((item) => item.listingId));
    if (error) throw error;
    const byId = new Map((data ?? []).map((row) => [row.listing_id, row]));
    const items = parsed.data.items.map((item) => {
      const listing = byId.get(item.listingId);
      if (!listing || listing.size !== item.size) {
        return { listingId: item.listingId, status: 'unavailable' as const };
      }
      const currentPrice = Number(listing.asking_price);
      if (currentPrice !== item.displayedPrice) {
        return { listingId: item.listingId, status: 'price_changed' as const, currentPrice };
      }
      return { listingId: item.listingId, status: 'available' as const };
    });
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Cart availability could not be checked.' }, { status: 503 });
  }
}
