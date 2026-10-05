import { CatalogPage, type CatalogSearchParams } from '@/components/catalog/CatalogPage';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <CatalogPage title="Find your piece" eyebrow="Search" pathname="/search" searchParams={await searchParams} />;
}
