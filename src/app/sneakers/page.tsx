import { CatalogPage, type CatalogSearchParams } from '@/components/catalog/CatalogPage';

export default async function SneakersPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <CatalogPage title="Sneakers" eyebrow="Shop by category" pathname="/sneakers" fixedCategory="sneakers" searchParams={await searchParams} />;
}
