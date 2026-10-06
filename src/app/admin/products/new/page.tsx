import { requireAdminPage } from '@/lib/admin/access';
import { ProductEditor } from '@/components/admin/ProductEditor';

export default async function NewAdminProductPage() {
  const { supabase } = await requireAdminPage('/admin/products/new');
  const [brands, categories] = await Promise.all([
    supabase.from('brands').select('id, name').eq('active', true).order('name'),
    supabase.from('categories').select('id, name').eq('active', true).order('sort_order'),
  ]);
  if (brands.error || categories.error) throw new Error('Catalog options are temporarily unavailable.');
  return <ProductEditor brands={brands.data ?? []} categories={categories.data ?? []} />;
}
