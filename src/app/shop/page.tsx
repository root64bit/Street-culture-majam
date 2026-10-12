import type { Metadata } from 'next';
import { CatalogPage, type CatalogSearchParams } from '@/components/catalog/CatalogPage';

export const metadata: Metadata = {
  title: 'All Products | STREET CULTURE',
  description: 'Browse every published and authenticated STREET CULTURE product available now.',
  alternates: { canonical: '/shop' },
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  return (
    <CatalogPage
      title="The complete edit"
      eyebrow="Street Culture catalog"
      pathname="/shop"
      searchParams={await searchParams}
    />
  );
}
