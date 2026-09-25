export interface CatalogFilter {
  brandId?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: string;
  condition?: string;
  sort?: 'price_asc' | 'price_desc' | 'newest';
}
