import { Storefront } from '@/components/home/Storefront';
import {
  getCatalogBrands,
  getCatalogCategories,
  getFeaturedProducts,
  getMostWanted,
  getNewArrivals,
} from '@/services/catalog.service';

export default async function HomePage() {
  const [products, newArrivals, featured, categories, brands] = await Promise.all([
    getMostWanted(),
    getNewArrivals(),
    getFeaturedProducts(1),
    getCatalogCategories(),
    getCatalogBrands(),
  ]);
  return (
    <Storefront
      products={products}
      newArrivals={newArrivals}
      featuredProduct={featured[0]}
      categories={categories}
      brands={brands}
    />
  );
}
