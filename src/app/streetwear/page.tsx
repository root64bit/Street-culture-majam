import { CatalogPage, type CatalogSearchParams } from '@/components/catalog/CatalogPage';

export default async function StreetwearPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <CatalogPage title="Streetwear" eyebrow="Shop by category" pathname="/streetwear" fixedCategory="streetwear" searchParams={await searchParams} />;
}
