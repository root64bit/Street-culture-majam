import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { isFootwearProduct, isPurchasableSize } from '@/lib/product-sizes';
const first = <T>(value: T | T[] | null): T | undefined => Array.isArray(value) ? value[0] : value ?? undefined;

export async function checkoutSizesConfirmed(admin: ReturnType<typeof createAdminClient>, items: { listingId: string; size: string }[]) {
  // Include reserved records so a retry of the same order remains idempotent.
  // Availability and ownership are still decided transactionally by the RPC.
  const { data, error } = await admin.from('listings').select(
    'id, variant:product_variants(size,size_system), product:products(name, category:categories(name,slug))'
  ).in('id', items.map((item) => item.listingId));
  if (error) throw new Error('Size confirmation temporarily unavailable.');
  return items.every((item) => {
    const listing = data.find((row) => row.id === item.listingId);
    if (!listing) return false;
    const variant = first(listing.variant), product = first(listing.product);
    const category = product && first(product.category);
    return Boolean(variant && product && variant.size === item.size &&
      isPurchasableSize(variant.size, variant.size_system, isFootwearProduct(category?.slug || category?.name || '', product.name)));
  });
}
