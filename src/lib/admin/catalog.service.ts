import { validId, pageNumber } from '@/lib/admin/filters';
export type CatalogFilters = {
  q?: string;
  brand?: string;
  category?: string;
  status?: string;
  featured?: string;
  wanted?: string;
  sort?: string;
  page?: string;
};
export function catalogFilters(params: CatalogFilters) {
  const q = (params.q ?? '')
    .trim()
    .slice(0, 120)
    .replace(/[%_,()]/g, '');
  const brand = validId(params.brand);
  const category = validId(params.category);
  const status = ['active', 'draft', 'archived'].includes(params.status ?? '')
    ? params.status!
    : '';
  const featured = ['true', 'false'].includes(params.featured ?? '') ? params.featured! : '';
  const wanted = ['true', 'false'].includes(params.wanted ?? '') ? params.wanted! : '';
  const sort = ['name', 'price', 'updated'].includes(params.sort ?? '') ? params.sort! : 'updated';
  return {
    page: pageNumber(params.page),
    url: { q, brand, category, status, featured, wanted, sort },
    rpc: {
      search_text: q,
      ...(brand ? { brand_filter: brand } : {}),
      ...(category ? { category_filter: category } : {}),
      status_filter: status,
      ...(featured ? { featured_filter: featured === 'true' } : {}),
      ...(wanted ? { wanted_filter: wanted === 'true' } : {}),
      sort_by: sort,
    },
  };
}
