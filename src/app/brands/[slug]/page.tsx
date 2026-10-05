import { CatalogPage, type CatalogSearchParams } from '@/components/catalog/CatalogPage';
import { getCatalogBrands } from '@/services/catalog.service';
import { notFound } from 'next/navigation';

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug } = await params;
  const brand = (await getCatalogBrands()).find((entry) => entry.slug === slug);
  if (!brand) notFound();
  return <CatalogPage title={brand.name} eyebrow="Shop by brand" pathname={`/brands/${slug}`} fixedBrand={slug} searchParams={await searchParams} />;
}
