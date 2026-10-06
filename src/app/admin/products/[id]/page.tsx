import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin/access';
import { ProductEditor } from '@/components/admin/ProductEditor';

export default async function EditAdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdminPage(`/admin/products/${id}`);
  const [product, brands, categories, listings, variants] = await Promise.all([
    supabase.from('products').select('id, name, brand_id, category_id, description, model, sku, colorway, release_year, gender, active, product_media(id, storage_path, sort_order, alt_text)')
      .eq('id', id).maybeSingle(),
    supabase.from('brands').select('id, name').eq('active', true).order('name'),
    supabase.from('categories').select('id, name').eq('active', true).order('sort_order'),
    supabase.from('listings').select('id, status, condition, asking_price, currency, authentication_status, variant_id')
      .eq('product_id', id).order('created_at', { ascending: false }),
    supabase.from('product_variants').select('id, size, size_system').eq('product_id', id),
  ]);
  if (product.error || brands.error || categories.error || listings.error || variants.error) {
    throw new Error('Product draft is temporarily unavailable.');
  }
  if (!product.data) notFound();
  const variantById = new Map((variants.data ?? []).map((variant) => [variant.id, variant]));
  const stock = (listings.data ?? []).flatMap((listing) => {
    const variant = variantById.get(listing.variant_id);
    return variant ? [{
      id: listing.id, status: listing.status, condition: listing.condition,
      asking_price: listing.asking_price, currency: listing.currency,
      authentication_status: listing.authentication_status,
      size: variant.size, size_system: variant.size_system,
    }] : [];
  });
  return <ProductEditor product={product.data} brands={brands.data ?? []} categories={categories.data ?? []} stock={stock} />;
}
