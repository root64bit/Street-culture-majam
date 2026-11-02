// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCatalogFacets,
  catalogProductToStoreProduct,
  listingToStoreProduct,
  queryCatalogPage,
  type CatalogListing,
  type CatalogProduct,
} from '@/services/catalog.service';

const state = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => state }));

function builder(data: object[]) {
  const value: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'in', 'contains', 'gte', 'lte', 'ilike', 'order'])
    value[method] = vi.fn(() => value);
  value.range = vi.fn(async () => ({ data, count: data.length, error: null }));
  return value;
}
beforeEach(() => vi.clearAllMocks());

describe('public UK size discovery', () => {
  it('keeps UK and US labels on every quick-buy option without changing checkout sizes', async () => {
    const card: CatalogProduct = {
      authentication_status: 'PASSED',
      brand_id: null,
      brand_slug: null,
      category_id: null,
      category_name: 'Sneakers',
      colorway: null,
      conditions: ['NEW'],
      currency: 'MZN',
      description: null,
      featured: false,
      image_path: null,
      model: null,
      most_wanted: false,
      ownership_type: 'STREET_CULTURE',
      published_at: null,
      release_year: null,
      search_text: null,
      sku: null,
      style_code: null,
      variant_id: null,
      product_id: 'product',
      listing_id: 'uk-listing',
      product_name: 'Test',
      slug: 'test',
      brand_name: 'Brand',
      category_slug: 'sneakers',
      asking_price: 100,
      condition: 'NEW',
      size: '9',
      size_system: 'UK',
      sizes: ['9'],
      listing_options: [
        { listingId: 'uk-listing', size: '9', price: 100, condition: 'NEW' },
        { listingId: 'us-listing', size: '9', price: 110, condition: 'NEW' },
      ],
    };
    const cards = builder([card]);
    const sizes = builder([
      { listing_id: 'uk-listing', size_system: 'UK' },
      { listing_id: 'us-listing', size_system: 'US' },
    ]);
    state.from.mockImplementation((table) => (table === 'public_catalog_listings' ? sizes : cards));
    const result = await queryCatalogPage();
    const options = catalogProductToStoreProduct(result.rows[0]).listingOptions;
    expect(options).toMatchObject([
      { listingId: 'uk-listing', size: '9', sizeSystem: 'UK' },
      { listingId: 'us-listing', size: '9', sizeSystem: 'US' },
    ]);
    expect(sizes.in).toHaveBeenCalledWith('listing_id', ['uk-listing', 'us-listing']);
  });
  it('limits product cards to real listings matching both size and system', async () => {
    const cards = builder([]),
      matches = builder([{ product_id: 'uk-product' }]);
    state.from.mockImplementation((table) =>
      table === 'public_catalog_listings' ? matches : cards
    );
    await queryCatalogPage({ size: '9.5', sizeSystem: 'UK' });
    expect(matches.eq).toHaveBeenCalledWith('size_system', 'UK');
    expect(matches.eq).toHaveBeenCalledWith('size', '9.5');
    expect(cards.in).toHaveBeenCalledWith('product_id', ['uk-product']);
  });
  it('matches an existing comma-containing label as one exact value, not an array expression', async () => {
    const cards = builder([]),
      matches = builder([{ product_id: 'legacy-product' }]);
    state.from.mockImplementation((table) =>
      table === 'public_catalog_listings' ? matches : cards
    );
    await queryCatalogPage({ size: '7, 8, 9', sizeSystem: 'UK' });
    expect(matches.eq).toHaveBeenCalledWith('size', '7, 8, 9');
    expect(cards.contains).not.toHaveBeenCalled();
    expect(cards.in).toHaveBeenCalledWith('product_id', ['legacy-product']);
  });
  it('keeps old bare size links system-neutral instead of silently converting stock', async () => {
    const cards = builder([]),
      matches = builder([{ product_id: 'product' }]);
    state.from.mockImplementation((table) =>
      table === 'public_catalog_listings' ? matches : cards
    );
    await queryCatalogPage({ size: '9' });
    expect(matches.eq).toHaveBeenCalledWith('size', '9');
    expect(matches.eq).not.toHaveBeenCalledWith('size_system', expect.anything());
  });
  it('sorts numeric sizes naturally and presents UK first without fabricating availability', async () => {
    state.rpc.mockResolvedValue({
      data: {
        sizes: [
          { size: '10', size_system: 'UK', listing_count: 1 },
          { size: '9.5', size_system: 'UK', listing_count: 1 },
          { size: '8', size_system: 'US', listing_count: 1 },
          { size: '9', size_system: 'UK', listing_count: 1 },
        ],
      },
      error: null,
    });
    expect((await getCatalogFacets()).sizes.map((size) => `${size.system}:${size.value}`)).toEqual([
      'UK:9',
      'UK:9.5',
      'UK:10',
      'US:8',
    ]);
  });
  it('carries the true size system to product details and keeps the checkout size raw', () => {
    const listing = listingToStoreProduct({
      listing_id: 'listing',
      product_id: 'product',
      product_name: 'Test',
      slug: 'test',
      brand_name: 'Brand',
      category_slug: 'sneakers',
      asking_price: 100,
      condition: 'NEW',
      size: '9.5',
      size_system: 'UK',
    } as CatalogListing);
    expect(listing.sizes).toEqual(['9.5']);
    expect(listing.sizeSystem).toBe('UK');
    expect(listing.listingOptions?.[0]).toMatchObject({ size: '9.5', sizeSystem: 'UK' });
  });
});
