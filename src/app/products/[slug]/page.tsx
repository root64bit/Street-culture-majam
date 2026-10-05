import { notFound } from 'next/navigation';
import { ProductPurchasePanel } from '@/components/catalog/ProductPurchasePanel';
import { getProductBySlug } from '@/services/catalog.service';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const brand = Array.isArray(product.brand) ? product.brand[0] : product.brand;
  return (
    <ProductPurchasePanel
      productId={product.id}
      name={product.name}
      brand={brand.name}
      description={product.description}
      model={product.model}
      styleCode={product.style_code ?? product.sku}
      image={product.image}
      listings={product.listings}
    />
  );
}
