import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { CatalogResults } from '@/components/catalog/CatalogResults';
import {
  getCatalogBrands,
  getCatalogCategories,
  getProductsByCategory,
  listingToStoreProduct,
  queryCatalog,
  searchProducts,
  type CatalogFilters,
  type CatalogSort,
} from '@/services/catalog.service';

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

function value(params: CatalogSearchParams, key: string) {
  const result = params[key];
  return (Array.isArray(result) ? result[0] : result)?.trim() ?? '';
}

function price(valueText: string) {
  const amount = Number(valueText);
  return valueText !== '' && Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

const sortOptions: { value: CatalogSort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export async function CatalogPage({
  title,
  eyebrow,
  pathname,
  searchParams,
  fixedCategory,
  fixedBrand,
}: {
  title: string;
  eyebrow: string;
  pathname: string;
  searchParams: CatalogSearchParams;
  fixedCategory?: string;
  fixedBrand?: string;
}) {
  const sortText = value(searchParams, 'sort');
  const sort = sortOptions.find((option) => option.value === sortText)?.value ?? 'featured';
  const page = Math.max(1, Math.min(1000, Number.parseInt(value(searchParams, 'page'), 10) || 1));
  const query = value(searchParams, 'q').slice(0, 100);
  const filters: CatalogFilters = {
    category: (fixedCategory ?? value(searchParams, 'category')) || undefined,
    brand: (fixedBrand ?? value(searchParams, 'brand')) || undefined,
    size: value(searchParams, 'size') || undefined,
    condition: value(searchParams, 'condition') || undefined,
    minPrice: price(value(searchParams, 'min')),
    maxPrice: price(value(searchParams, 'max')),
    query: query || undefined,
    sort,
    limit: 25,
    offset: (page - 1) * 24,
  };

  const [categories, brands, fetched] = await Promise.all([
    getCatalogCategories(),
    getCatalogBrands(),
    filters.category
      ? getProductsByCategory(filters.category, filters)
      : query
        ? searchProducts(query, filters)
        : queryCatalog(filters).then((rows) => rows.map(listingToStoreProduct)),
  ]);
  const products = fetched.slice(0, 24);
  const hasMore = fetched.length > 24;

  const currentQuery = new URLSearchParams();
  for (const key of ['q', 'category', 'brand', 'size', 'condition', 'min', 'max', 'sort']) {
    const parameter = value(searchParams, key);
    if (parameter) currentQuery.set(key, parameter);
  }
  const pageHref = (nextPage: number) => {
    const target = new URLSearchParams(currentQuery);
    target.set('page', String(nextPage));
    return `${pathname}?${target}`;
  };

  return (
    <main className="min-h-screen bg-[#fbfaf6] px-4 pb-20 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <Link href="/" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
        <div className="mt-8 max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">{eyebrow}</p>
          <h1 className="mt-3 text-5xl font-black uppercase leading-[0.9] tracking-[-0.07em] sm:text-7xl">{title}</h1>
          <p className="mt-5 text-sm leading-6 text-black/55">Live, verified listings. Availability and prices are checked again at checkout.</p>
        </div>

        <form action={pathname} method="get" className="mt-10 grid gap-3 rounded-[1.5rem] bg-[#efede6] p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <label className="text-[10px] font-bold uppercase tracking-wider">Search
            <input name="q" defaultValue={query} placeholder="Brand, model, style code" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-black" />
          </label>
          {!fixedCategory && <label className="text-[10px] font-bold uppercase tracking-wider">Category
            <select name="category" defaultValue={filters.category ?? ''} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal">
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
            </select>
          </label>}
          {!fixedBrand && <label className="text-[10px] font-bold uppercase tracking-wider">Brand
            <select name="brand" defaultValue={filters.brand ?? ''} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal">
              <option value="">All brands</option>
              {brands.map((brand) => <option key={brand.id} value={brand.slug}>{brand.name}</option>)}
            </select>
          </label>}
          <label className="text-[10px] font-bold uppercase tracking-wider">Size
            <input name="size" defaultValue={filters.size ?? ''} placeholder="e.g. 10.5 or L" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-black" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider">Condition
            <input name="condition" defaultValue={filters.condition ?? ''} placeholder="e.g. NEW" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-black" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider">Minimum MZN
            <input name="min" type="number" min="0" defaultValue={filters.minPrice ?? ''} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-black" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider">Maximum MZN
            <input name="max" type="number" min="0" defaultValue={filters.maxPrice ?? ''} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-black" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider">Sort
            <select name="sort" defaultValue={sort} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal">
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 self-end rounded-full bg-black px-6 text-xs font-bold uppercase tracking-wider text-white">Apply filters</button>
        </form>

        <div className="mb-6 mt-10 flex items-center justify-between text-xs text-black/50">
          <p>Page {page} · {products.length} live {products.length === 1 ? 'listing' : 'listings'}</p>
          <Link href={pathname} className="underline underline-offset-4">Clear filters</Link>
        </div>
        <CatalogResults products={products} />
        {(page > 1 || hasMore) && <nav aria-label="Catalog pages" className="mt-12 flex justify-between gap-4">
          {page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex items-center gap-2 rounded-full border border-black px-5 py-3 text-xs font-bold uppercase tracking-wider"><ArrowLeft className="h-4 w-4" /> Previous</Link> : <span />}
          {hasMore && <Link href={pageHref(page + 1)} className="inline-flex items-center gap-2 rounded-full border border-black px-5 py-3 text-xs font-bold uppercase tracking-wider">Next <ArrowRight className="h-4 w-4" /></Link>}
        </nav>}
      </div>
    </main>
  );
}
