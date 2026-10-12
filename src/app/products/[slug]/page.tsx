import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ProductPurchasePanel } from '@/components/catalog/ProductPurchasePanel';
import { getProductBySlug, getRelatedProducts } from '@/services/catalog.service';

const getProduct = cache(getProductBySlug);

function first<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: 'Product unavailable | STREET CULTURE' };
  const brand = first(product.brand);
  const title = product.meta_title || `${brand.name} ${product.name} | STREET CULTURE`;
  const description =
    product.meta_description ||
    product.description ||
    `Shop the authenticated ${brand.name} ${product.name} at STREET CULTURE.`;
  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      images: product.images[0] ? [{ url: product.images[0].src, alt: product.images[0].alt }] : [],
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const brand = first(product.brand);
  const category = first(product.category);
  const related = await getRelatedProducts(product.id, category.slug, 4);
  const productUrl = `${(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://street-culture-majam.vercel.app'
  ).replace(/\/$/, '')}/products/${product.slug}`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || undefined,
    image: product.images.map((image) => image.src),
    sku: product.sku || product.style_code || undefined,
    brand: { '@type': 'Brand', name: brand.name },
    category: category.name,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'MZN',
      lowPrice: product.lowestPrice,
      offerCount: product.listings.length,
      availability: 'https://schema.org/InStock',
      url: productUrl,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <ProductPurchasePanel
        productId={product.id}
        name={product.name}
        brand={brand.name}
        category={category.name}
        description={product.description}
        model={product.model}
        styleCode={product.style_code ?? product.sku}
        colorway={product.colorway}
        releaseYear={product.release_year}
        images={product.images}
        listings={product.listings}
        related={related}
      />
    </>
  );
}
