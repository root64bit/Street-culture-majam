import 'server-only';

import type { StoreProduct } from '@/data/storefront';
import { createClient } from '@/lib/supabase/server';

type ListingRow = {
  id: string;
  condition: string;
  asking_price: number | string;
  currency: string;
  published_at: string | null;
  product: {
    name: string;
    slug: string;
    brand: { name: string } | { name: string }[];
    category: { slug: string } | { slug: string }[];
    media: { storage_path: string; sort_order: number }[];
  } | {
    name: string;
    slug: string;
    brand: { name: string } | { name: string }[];
    category: { slug: string } | { slug: string }[];
    media: { storage_path: string; sort_order: number }[];
  }[];
  variant: { size: string } | { size: string }[];
};

function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function categoryFromSlug(slug: string): StoreProduct['category'] {
  const normalized = slug.toLowerCase();
  if (normalized.includes('streetwear') || normalized.includes('apparel')) return 'streetwear';
  if (normalized.includes('luxury') || normalized.includes('designer')) return 'luxury';
  if (normalized.includes('accessor') || normalized.includes('bag')) return 'accessories';
  return 'sneakers';
}

export async function getLiveStoreListings(): Promise<StoreProduct[]> {
  try {
    const supabase = await createClient();
    const rows: ListingRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('listings')
        .select(
          'id, condition, asking_price, currency, published_at, product:products!inner(name, slug, active, brand:brands!inner(name, active), category:categories!inner(slug), media:product_media(storage_path, sort_order)), variant:product_variants!inner(size)',
        )
        .eq('status', 'LIVE')
        .eq('currency', 'MZN')
        .eq('product.active', true)
        .eq('product.brand.active', true)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, from + 999);

      if (error) return [];
      const page = (data ?? []) as unknown as ListingRow[];
      rows.push(...page);
      if (page.length < 1000) break;
    }

    if (!rows.length) return [];

    return rows.flatMap((listing) => {
      const product = first(listing.product);
      const variant = first(listing.variant);
      const brand = first(product?.brand);
      const category = first(product?.category);
      if (!product || !variant || !brand || !category) return [];

      const media = [...(product.media ?? [])].sort((left, right) => left.sort_order - right.sort_order)[0];
      const image = media?.storage_path
        ? media.storage_path.startsWith('http')
          ? media.storage_path
          : supabase.storage.from('product-images').getPublicUrl(media.storage_path).data.publicUrl
        : '/images/street-culture-products.png';

      return [{
        id: listing.id,
        listingId: listing.id,
        name: product.name,
        slug: product.slug,
        brand: brand.name,
        category: categoryFromSlug(category.slug),
        price: Number(listing.asking_price),
        condition: listing.condition,
        sizes: [variant.size],
        image,
        imagePosition: '50% 50%',
        isNew: Boolean(listing.published_at && Date.now() - Date.parse(listing.published_at) < 30 * 24 * 60 * 60 * 1000),
      }];
    });
  } catch {
    // The homepage retains its explicitly labelled preview catalog when the
    // local Supabase instance is not configured or has no live inventory.
    return [];
  }
}
