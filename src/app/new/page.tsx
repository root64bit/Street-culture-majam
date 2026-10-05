import { CatalogPage, type CatalogSearchParams } from '@/components/catalog/CatalogPage';

export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return <CatalogPage title="Latest pieces" eyebrow="The edit" pathname="/new" searchParams={await searchParams} />;
}
