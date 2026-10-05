import { CatalogPage, type CatalogSearchParams } from '@/components/catalog/CatalogPage';

export default async function LuxuryPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <CatalogPage title="Luxury" eyebrow="Shop by category" pathname="/luxury" fixedCategory="luxury" searchParams={await searchParams} />;
}
