import { CatalogPage, type CatalogSearchParams } from '@/components/catalog/CatalogPage';

export default async function AccessoriesPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <CatalogPage title="Accessories" eyebrow="Shop by category" pathname="/accessories" fixedCategory="accessories" searchParams={await searchParams} />;
}
