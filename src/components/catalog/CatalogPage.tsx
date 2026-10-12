import Link from 'next/link';
import { ArrowLeft, ArrowRight, SlidersHorizontal, X } from 'lucide-react';
import { CatalogResults } from '@/components/catalog/CatalogResults';
import {
  catalogProductToStoreProduct,
  getCatalogFacets,
  queryCatalogPage,
  type CatalogFacets,
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
  { value: 'newest', label: 'Newest arrivals' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'brand', label: 'Brand A–Z' },
];

function FilterFields({
  filters,
  facets,
  query,
  sort,
  fixedCategory,
  fixedBrand,
  suffix,
}: {
  filters: CatalogFilters;
  facets: CatalogFacets;
  query: string;
  sort: CatalogSort;
  fixedCategory?: string;
  fixedBrand?: string;
  suffix: string;
}) {
  return (
    <>
      <label className="block text-[10px] font-bold uppercase tracking-[0.14em]">
        Search
        <input
          name="q"
          defaultValue={query}
          placeholder="Brand, model, style code"
          className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-black"
        />
      </label>
      {!fixedCategory && (
        <label className="block text-[10px] font-bold uppercase tracking-[0.14em]">
          Category
          <select
            name="category"
            defaultValue={filters.category ?? ''}
            className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal"
          >
            <option value="">All categories</option>
            {facets.categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name} ({category.productCount})
              </option>
            ))}
          </select>
        </label>
      )}
      {!fixedBrand && (
        <label className="block text-[10px] font-bold uppercase tracking-[0.14em]">
          Brand
          <input
            name="brand"
            list={`catalog-brands-${suffix}`}
            defaultValue={filters.brand ?? ''}
            placeholder="All brands"
            className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-black"
          />
          <datalist id={`catalog-brands-${suffix}`}>
            {facets.brands.map((brand) => (
              <option key={brand.id} value={brand.slug}>
                {brand.name} ({brand.productCount})
              </option>
            ))}
          </datalist>
        </label>
      )}
      <label className="block text-[10px] font-bold uppercase tracking-[0.14em]">
        Size
        <select
          name="size"
          defaultValue={filters.size ?? ''}
          className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal"
        >
          <option value="">All sizes</option>
          {facets.sizes.map((size) => (
            <option key={`${size.system}-${size.value}`} value={size.value}>
              {size.system ? `${size.system} ` : ''}
              {size.value} ({size.count})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[10px] font-bold uppercase tracking-[0.14em]">
        Condition
        <select
          name="condition"
          defaultValue={filters.condition ?? ''}
          className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal"
        >
          <option value="">All conditions</option>
          {facets.conditions.map((condition) => (
            <option key={condition.value} value={condition.value}>
              {condition.value} ({condition.count})
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[10px] font-bold uppercase tracking-[0.14em]">
          Min MZN
          <input
            name="min"
            type="number"
            min="0"
            defaultValue={filters.minPrice ?? ''}
            className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal tracking-normal outline-none focus:border-black"
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-[0.14em]">
          Max MZN
          <input
            name="max"
            type="number"
            min="0"
            defaultValue={filters.maxPrice ?? ''}
            className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal tracking-normal outline-none focus:border-black"
          />
        </label>
      </div>
      <label className="block text-[10px] font-bold uppercase tracking-[0.14em]">
        Sort by
        <select
          name="sort"
          defaultValue={sort}
          className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal normal-case tracking-normal"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-2xl border border-black/10 bg-white p-4 text-xs leading-5 text-black/55">
        <p className="font-bold text-black">Available now · Verified only</p>
        <p className="mt-1">
          Draft, unverified, reserved and sold items are never purchasable here.
        </p>
      </div>
    </>
  );
}

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
    limit: 24,
    offset: (page - 1) * 24,
  };

  const [facets, result] = await Promise.all([getCatalogFacets(), queryCatalogPage(filters)]);
  const products = result.rows.map(catalogProductToStoreProduct);
  const pageCount = Math.max(1, Math.ceil(result.count / 24));
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
    <main className="min-h-screen bg-[#f7f6f2] px-4 pb-24 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/45 hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
        <div className="mt-8 flex flex-col justify-between gap-6 border-b border-black/10 pb-10 lg:flex-row lg:items-end">
          <div className="max-w-4xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#006b50]">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-5xl font-black uppercase leading-[0.86] tracking-[-0.075em] sm:text-7xl lg:text-8xl">
              {title}
            </h1>
          </div>
          <p className="max-w-md text-sm leading-7 text-black/55">
            Every result is a published, authenticated piece with inventory rechecked at checkout.
          </p>
        </div>

        <details className="sticky top-20 z-40 mt-5 rounded-2xl border border-black/10 bg-white/85 p-2 shadow-sm backdrop-blur-xl lg:hidden">
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-xs font-bold uppercase tracking-[0.13em]">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Filters & sort
            </span>
            <span>
              {Object.values(filters).filter((entry) => entry !== undefined).length - 3} active
            </span>
          </summary>
          <form
            action={pathname}
            method="get"
            className="mt-2 max-h-[70dvh] space-y-5 overflow-y-auto rounded-xl bg-[#eeede7] p-4"
          >
            <FilterFields
              filters={filters}
              facets={facets}
              query={query}
              sort={sort}
              fixedCategory={fixedCategory}
              fixedBrand={fixedBrand}
              suffix="mobile"
            />
            <div className="sticky bottom-0 grid grid-cols-2 gap-3 bg-[#eeede7] pt-2">
              <Link
                href={pathname}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black text-xs font-bold uppercase tracking-wider"
              >
                <X className="h-4 w-4" /> Clear all
              </Link>
              <button className="h-12 rounded-full bg-black text-xs font-bold uppercase tracking-wider text-white">
                Apply filters
              </button>
            </div>
          </form>
        </details>

        <div className="mt-8 grid gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <form
              action={pathname}
              method="get"
              className="sticky top-28 space-y-5 rounded-[1.75rem] border border-black/10 bg-[#eeede7] p-5"
            >
              <div className="flex items-center justify-between border-b border-black/10 pb-4">
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                  <SlidersHorizontal className="h-4 w-4" /> Filters
                </p>
                <Link
                  href={pathname}
                  className="text-[10px] font-bold uppercase tracking-wider text-black/45 hover:text-black"
                >
                  Clear all
                </Link>
              </div>
              <FilterFields
                filters={filters}
                facets={facets}
                query={query}
                sort={sort}
                fixedCategory={fixedCategory}
                fixedBrand={fixedBrand}
                suffix="desktop"
              />
              <button className="h-12 w-full rounded-full bg-black text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#c6ff00] hover:text-black">
                Apply filters
              </button>
            </form>
          </aside>

          <section aria-label="Catalog results">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-black/45">
                  All pieces
                </p>
                <p className="mt-1 text-2xl font-black tracking-[-0.04em]">
                  {result.count} {result.count === 1 ? 'product' : 'products'}
                </p>
              </div>
              <p className="text-xs text-black/45">
                Page {page} of {pageCount}
              </p>
            </div>
            <CatalogResults products={products} />
            {pageCount > 1 && (
              <nav aria-label="Catalog pages" className="mt-12 flex justify-between gap-4">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="inline-flex items-center gap-2 rounded-full border border-black px-5 py-3 text-xs font-bold uppercase tracking-wider"
                  >
                    <ArrowLeft className="h-4 w-4" /> Previous
                  </Link>
                ) : (
                  <span />
                )}
                {page < pageCount && (
                  <Link
                    href={pageHref(page + 1)}
                    className="inline-flex items-center gap-2 rounded-full border border-black px-5 py-3 text-xs font-bold uppercase tracking-wider"
                  >
                    Next <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </nav>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
