import 'server-only';

import type { StoreProduct } from '@/data/storefront';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

export type CatalogListing = Database['public']['Views']['public_catalog_listings']['Row'];
export type CatalogSort = 'featured' | 'newest' | 'price_asc' | 'price_desc';

export interface CatalogFilters {
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  query?: string;
  sort?: CatalogSort;
  limit?: number;
  offset?: number;
}

const PAGE_SIZE = 1000;
const LOCAL_IMAGE = '/images/street-culture-products.png';

function required<T>(value: T | null, field: string): T {
  if (value === null) throw new Error(`Catalog listing is missing ${field}`);
  return value;
}

function imageForPath(path: string | null, supabaseUrl: string) {
  if (!path) return LOCAL_IMAGE;
  if (path.startsWith('/images/')) return path;
  if (/^https?:\/\//.test(path)) return LOCAL_IMAGE;
  return `${supabaseUrl}/storage/v1/object/public/product-images/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function listingToStoreProduct(listing: CatalogListing): StoreProduct {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  return {
    id: required(listing.listing_id, 'listing_id'),
    listingId: required(listing.listing_id, 'listing_id'),
    productId: required(listing.product_id, 'product_id'),
    name: required(listing.product_name, 'product_name'),
    slug: required(listing.slug, 'slug'),
    brand: required(listing.brand_name, 'brand_name'),
    brandSlug: listing.brand_slug ?? undefined,
    category: required(listing.category_slug, 'category_slug'),
    categoryName: listing.category_name ?? undefined,
    price: Number(required(listing.asking_price, 'asking_price')),
    condition: required(listing.condition, 'condition'),
    sizes: [required(listing.size, 'size')],
    ownershipType: listing.ownership_type ?? undefined,
    authenticationStatus: listing.authentication_status ?? undefined,
    image: imageForPath(listing.image_path, supabaseUrl),
    imagePosition: '50% 50%',
    isNew: Boolean(
      listing.published_at &&
      Date.now() - Date.parse(listing.published_at) < 30 * 24 * 60 * 60 * 1000
    ),
  };
}

export async function queryCatalog(filters: CatalogFilters = {}): Promise<CatalogListing[]> {
  const supabase = await createClient();
  let request = supabase.from('public_catalog_listings').select('*');

  if (filters.category) request = request.eq('category_slug', filters.category);
  if (filters.brand) request = request.eq('brand_slug', filters.brand);
  if (filters.size) request = request.eq('size', filters.size);
  if (filters.condition) request = request.eq('condition', filters.condition);
  if (filters.minPrice !== undefined) request = request.gte('asking_price', filters.minPrice);
  if (filters.maxPrice !== undefined) request = request.lte('asking_price', filters.maxPrice);
  if (filters.query?.trim()) request = request.ilike('search_text', `%${filters.query.trim()}%`);

  switch (filters.sort ?? 'featured') {
    case 'newest':
      request = request.order('published_at', { ascending: false, nullsFirst: false });
      break;
    case 'price_asc':
      request = request.order('asking_price', { ascending: true });
      break;
    case 'price_desc':
      request = request.order('asking_price', { ascending: false });
      break;
    default:
      request = request
        .order('featured', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false });
  }

  const from = Math.max(0, filters.offset ?? 0);
  const limit = Math.min(PAGE_SIZE, Math.max(1, filters.limit ?? 60));
  const { data, error } = await request
    .order('listing_id', { ascending: true })
    .range(from, from + limit - 1);

  if (error) throw new Error(`Catalog query failed: ${error.message}`);
  return data ?? [];
}

async function queryAllCatalog(filters: CatalogFilters = {}) {
  const rows: CatalogListing[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await queryCatalog({ ...filters, limit: PAGE_SIZE, offset });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function getMostWanted() {
  // No popularity score is stored yet; featured listings lead, followed by
  // recent inventory. Every sellable listing remains reachable in the carousel.
  return (await queryAllCatalog()).map(listingToStoreProduct);
}

export async function getFeaturedProducts(limit = 8) {
  return (await queryCatalog({ sort: 'featured', limit }))
    .filter((listing) => listing.featured)
    .map(listingToStoreProduct);
}

export async function getNewArrivals(limit = 12) {
  return (await queryCatalog({ sort: 'newest', limit })).map(listingToStoreProduct);
}

export async function getProductsByCategory(category: string, filters: CatalogFilters = {}) {
  return (await queryCatalog({ ...filters, category })).map(listingToStoreProduct);
}

export async function searchProducts(query: string, filters: CatalogFilters = {}) {
  return (await queryCatalog({ ...filters, query })).map(listingToStoreProduct);
}

export async function getLiveListingsForProduct(productId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('public_catalog_listings')
    .select('*')
    .eq('product_id', productId)
    .order('asking_price', { ascending: true });
  if (error) throw new Error(`Product availability failed: ${error.message}`);
  return data ?? [];
}

export async function getAvailableVariants(productId: string) {
  const listings = await getLiveListingsForProduct(productId);
  const bySize = new Map<string, {
    size: string;
    listingCount: number;
    lowestPrice: number;
    conditions: string[];
    listings: StoreProduct[];
  }>();

  for (const listing of listings) {
    const size = required(listing.size, 'size');
    const condition = required(listing.condition, 'condition');
    const current = bySize.get(size);
    if (current) {
      current.listingCount += 1;
      current.lowestPrice = Math.min(current.lowestPrice, Number(listing.asking_price));
      if (!current.conditions.includes(condition)) current.conditions.push(condition);
      current.listings.push(listingToStoreProduct(listing));
    } else {
      bySize.set(size, {
        size,
        listingCount: 1,
        lowestPrice: Number(listing.asking_price),
        conditions: [condition],
        listings: [listingToStoreProduct(listing)],
      });
    }
  }

  return Array.from(bySize.values());
}

export async function getProductBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, slug, description, model, style_code, sku, colorway, release_year, brand:brands!inner(name, slug, active), category:categories!inner(name, slug, active), media:product_media(storage_path, sort_order)')
    .eq('slug', slug)
    .eq('active', true)
    .eq('brand.active', true)
    .eq('category.active', true)
    .maybeSingle();
  if (error) throw new Error(`Product lookup failed: ${error.message}`);
  if (!data) return null;

  const listings = await getLiveListingsForProduct(data.id);
  const media = [...(data.media ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  return {
    ...data,
    image: imageForPath(media?.storage_path ?? null, supabaseUrl),
    listings: listings.map(listingToStoreProduct),
    lowestPrice: listings.length
      ? Math.min(...listings.map((listing) => Number(listing.asking_price)))
      : null,
    availableSizes: [...new Set(listings.map((listing) => listing.size))],
  };
}

export async function getCatalogCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`Categories failed: ${error.message}`);
  return data ?? [];
}

export async function getCatalogBrands() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(`Brands failed: ${error.message}`);
  return data ?? [];
}
