import 'server-only';

import { unstable_noStore as noStore } from 'next/cache';
import type { StoreListingOption, StoreProduct } from '@/data/storefront';
import { createClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/types/database.types';

export type CatalogListing = Database['public']['Views']['public_catalog_listings']['Row'];
export type CatalogProduct = Database['public']['Views']['public_catalog_products']['Row'];
export type CatalogSort = 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'brand';

export interface CatalogFilters {
  category?: string;
  brand?: string;
  size?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  query?: string;
  sort?: CatalogSort;
  featured?: boolean;
  mostWanted?: boolean;
  limit?: number;
  offset?: number;
}

export interface CatalogCategoryFacet {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  image: string;
}

export interface CatalogBrandFacet {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export interface CatalogOptionFacet {
  value: string;
  count: number;
  system?: string;
}

export interface CatalogFacets {
  categories: CatalogCategoryFacet[];
  brands: CatalogBrandFacet[];
  sizes: CatalogOptionFacet[];
  conditions: CatalogOptionFacet[];
}

const LOCAL_IMAGE = '/images/street-culture-products.png';

function required<T>(value: T | null, field: string): T {
  if (value === null) throw new Error(`Catalog record is missing ${field}`);
  return value;
}

function imageForPath(path: string | null, supabaseUrl: string) {
  if (!path) return LOCAL_IMAGE;
  if (path.startsWith('/images/')) return path;
  if (/^https?:\/\//.test(path)) return LOCAL_IMAGE;
  return `${supabaseUrl}/storage/v1/object/public/product-images/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function publicImage(path: string | null) {
  return imageForPath(path, process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '');
}

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listingOptions(value: Json | null): StoreListingOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!isRecord(option)) return [];
    const listingId = option.listingId;
    const size = option.size;
    const price = option.price;
    const condition = option.condition;
    return typeof listingId === 'string' &&
      typeof size === 'string' &&
      typeof price === 'number' &&
      typeof condition === 'string'
      ? [{ listingId, size, price, condition }]
      : [];
  });
}

export function listingToStoreProduct(listing: CatalogListing): StoreProduct {
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
    listingOptions: [
      {
        listingId: required(listing.listing_id, 'listing_id'),
        size: required(listing.size, 'size'),
        price: Number(required(listing.asking_price, 'asking_price')),
        condition: required(listing.condition, 'condition'),
      },
    ],
    image: publicImage(listing.image_path),
    imagePosition: '50% 50%',
    isNew: Boolean(
      listing.published_at &&
      Date.now() - Date.parse(listing.published_at) < 30 * 24 * 60 * 60 * 1000
    ),
  };
}

export function catalogProductToStoreProduct(product: CatalogProduct): StoreProduct {
  const options = listingOptions(product.listing_options);
  const first = options[0];
  return {
    id: required(product.product_id, 'product_id'),
    listingId: first?.listingId ?? required(product.listing_id, 'listing_id'),
    productId: required(product.product_id, 'product_id'),
    name: required(product.product_name, 'product_name'),
    slug: required(product.slug, 'slug'),
    brand: required(product.brand_name, 'brand_name'),
    brandSlug: product.brand_slug ?? undefined,
    category: required(product.category_slug, 'category_slug'),
    categoryName: product.category_name ?? undefined,
    price: Number(first?.price ?? required(product.asking_price, 'asking_price')),
    condition: first?.condition ?? required(product.condition, 'condition'),
    sizes: product.sizes?.filter(Boolean) ?? (first ? [first.size] : []),
    ownershipType: product.ownership_type ?? undefined,
    authenticationStatus: product.authentication_status ?? undefined,
    listingOptions: options,
    image: publicImage(product.image_path),
    imagePosition: '50% 50%',
    isNew: Boolean(
      product.published_at &&
      Date.now() - Date.parse(product.published_at) < 30 * 24 * 60 * 60 * 1000
    ),
  };
}

export async function queryCatalogPage(filters: CatalogFilters = {}) {
  noStore();
  const supabase = await createClient();
  let request = supabase.from('public_catalog_products').select('*', { count: 'exact' });

  if (filters.category) request = request.eq('category_slug', filters.category);
  if (filters.brand) request = request.eq('brand_slug', filters.brand);
  if (filters.size) request = request.contains('sizes', [filters.size]);
  if (filters.condition) request = request.contains('conditions', [filters.condition]);
  if (filters.minPrice !== undefined) request = request.gte('asking_price', filters.minPrice);
  if (filters.maxPrice !== undefined) request = request.lte('asking_price', filters.maxPrice);
  if (filters.query?.trim()) request = request.ilike('search_text', `%${filters.query.trim()}%`);
  if (filters.featured !== undefined) request = request.eq('featured', filters.featured);
  if (filters.mostWanted !== undefined) request = request.eq('most_wanted', filters.mostWanted);

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
    case 'brand':
      request = request.order('brand_name', { ascending: true });
      break;
    default:
      request = request
        .order('most_wanted', { ascending: false })
        .order('featured', { ascending: false })
        .order('published_at', { ascending: false, nullsFirst: false });
  }

  const from = Math.max(0, filters.offset ?? 0);
  const limit = Math.min(48, Math.max(1, filters.limit ?? 24));
  const { data, error, count } = await request
    .order('product_id', { ascending: true })
    .range(from, from + limit - 1);
  if (error) throw new Error(`Catalog query failed: ${error.message}`);
  return { rows: data ?? [], count: count ?? 0 };
}

export async function queryCatalog(filters: CatalogFilters = {}): Promise<CatalogProduct[]> {
  return (await queryCatalogPage(filters)).rows;
}

export async function getMostWanted(limit = 12) {
  return (await queryCatalog({ sort: 'featured', limit })).map(catalogProductToStoreProduct);
}

export async function getFeaturedProducts(limit = 8) {
  return (await queryCatalog({ sort: 'newest', featured: true, limit })).map(
    catalogProductToStoreProduct
  );
}

export async function getNewArrivals(limit = 12) {
  return (await queryCatalog({ sort: 'newest', limit })).map(catalogProductToStoreProduct);
}

export async function getProductsByCategory(category: string, filters: CatalogFilters = {}) {
  return (await queryCatalog({ ...filters, category })).map(catalogProductToStoreProduct);
}

export async function searchProducts(query: string, filters: CatalogFilters = {}) {
  return (await queryCatalog({ ...filters, query })).map(catalogProductToStoreProduct);
}

export async function getLiveListingsForProduct(productId: string) {
  noStore();
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
  const bySize = new Map<
    string,
    {
      size: string;
      listingCount: number;
      lowestPrice: number;
      conditions: string[];
      listings: StoreProduct[];
    }
  >();

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
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, name, slug, description, model, style_code, sku, colorway, release_year, meta_title, meta_description, brand:brands!inner(name, slug, active), category:categories!inner(name, slug, active), media:product_media(id, storage_path, sort_order, alt_text)'
    )
    .eq('slug', slug)
    .eq('active', true)
    .eq('brand.active', true)
    .eq('category.active', true)
    .maybeSingle();
  if (error) throw new Error(`Product lookup failed: ${error.message}`);
  if (!data) return null;

  const listings = await getLiveListingsForProduct(data.id);
  if (!listings.length) return null;
  const media = [...(data.media ?? [])].sort((left, right) => left.sort_order - right.sort_order);
  return {
    ...data,
    image: publicImage(media[0]?.storage_path ?? null),
    images: media.map((item) => ({
      id: item.id,
      src: publicImage(item.storage_path),
      alt: item.alt_text || data.name,
    })),
    listings: listings.map(listingToStoreProduct),
    lowestPrice: Math.min(...listings.map((listing) => Number(listing.asking_price))),
    availableSizes: [...new Set(listings.map((listing) => listing.size).filter(Boolean))],
  };
}

export async function getRelatedProducts(productId: string, category: string, limit = 4) {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('public_catalog_products')
    .select('*')
    .eq('category_slug', category)
    .neq('product_id', productId)
    .order('most_wanted', { ascending: false })
    .order('featured', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(8, Math.max(1, limit)));
  if (error) throw new Error(`Related products failed: ${error.message}`);
  return (data ?? []).map(catalogProductToStoreProduct);
}

type RawFacets = {
  categories?: Array<{
    id?: unknown;
    name?: unknown;
    slug?: unknown;
    product_count?: unknown;
    image_path?: unknown;
  }>;
  brands?: Array<{
    id?: unknown;
    name?: unknown;
    slug?: unknown;
    product_count?: unknown;
  }>;
  sizes?: Array<{ size?: unknown; size_system?: unknown; listing_count?: unknown }>;
  conditions?: Array<{ condition?: unknown; listing_count?: unknown }>;
};

export async function getCatalogFacets(): Promise<CatalogFacets> {
  noStore();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('public_catalog_facets');
  if (error) throw new Error(`Catalog facets failed: ${error.message}`);
  const facets = (
    data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  ) as RawFacets;
  return {
    categories: (facets.categories ?? []).flatMap((item) =>
      typeof item.id === 'string' && typeof item.name === 'string' && typeof item.slug === 'string'
        ? [
            {
              id: item.id,
              name: item.name,
              slug: item.slug,
              productCount: Number(item.product_count ?? 0),
              image: publicImage(typeof item.image_path === 'string' ? item.image_path : null),
            },
          ]
        : []
    ),
    brands: (facets.brands ?? []).flatMap((item) =>
      typeof item.id === 'string' && typeof item.name === 'string' && typeof item.slug === 'string'
        ? [
            {
              id: item.id,
              name: item.name,
              slug: item.slug,
              productCount: Number(item.product_count ?? 0),
            },
          ]
        : []
    ),
    sizes: (facets.sizes ?? []).flatMap((item) =>
      typeof item.size === 'string'
        ? [
            {
              value: item.size,
              system: typeof item.size_system === 'string' ? item.size_system : undefined,
              count: Number(item.listing_count ?? 0),
            },
          ]
        : []
    ),
    conditions: (facets.conditions ?? []).flatMap((item) =>
      typeof item.condition === 'string'
        ? [{ value: item.condition, count: Number(item.listing_count ?? 0) }]
        : []
    ),
  };
}

export async function getCatalogCategories() {
  return (await getCatalogFacets()).categories;
}

export async function getCatalogBrands() {
  return (await getCatalogFacets()).brands;
}
