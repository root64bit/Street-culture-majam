import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import { requireStaffPage } from '@/lib/admin/access';

export default async function AdminProductsPage() {
  const { supabase } = await requireStaffPage('/admin/products');
  const { data: products, error } = await supabase.from('products')
    .select('id, name, slug, active, created_at, brand:brands(name), category:categories(name), product_media(id, storage_path, sort_order)')
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error('Products are temporarily unavailable.');

  return (
    <section className="min-h-screen bg-[#fbfaf6] px-4 pb-24 pt-32 text-black sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-black/50 hover:text-black"><ArrowLeft className="h-4 w-4" /> Admin</Link>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#065f46]">Catalog workspace</p><h1 className="mt-2 text-5xl font-black tracking-[-0.07em] sm:text-7xl">PRODUCTS.</h1><p className="mt-3 text-sm text-black/55">Drafts are invisible to shoppers and cannot be bought.</p></div>
          <Link href="/admin/products/new" className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#065f46]"><Plus className="h-4 w-4" /> New draft</Link>
        </div>

        <div className="mt-10 overflow-hidden rounded-[2rem] border border-black/10 bg-white">
          {!products?.length ? <p className="p-8 text-sm text-black/55">No products yet. Create the first draft to begin.</p> : products.map((product) => (
            <div key={product.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 p-5 last:border-b-0 sm:px-7">
              <div className="flex min-w-0 items-center gap-4">
                {product.product_media.length > 0 ? (
                  <Image
                    src={supabase.storage.from('product-images').getPublicUrl([...product.product_media].sort((a, b) => a.sort_order - b.sort_order)[0].storage_path).data.publicUrl}
                    alt={`${product.name} concept image`}
                    width={72}
                    height={72}
                    unoptimized
                    className="h-[72px] w-[72px] shrink-0 rounded-xl bg-[#f5f4f0] object-cover"
                  />
                ) : <div className="h-[72px] w-[72px] shrink-0 rounded-xl bg-[#f5f4f0]" aria-hidden="true" />}
                <div className="min-w-0"><p className="font-bold">{product.name}</p><p className="mt-1 text-xs text-black/50">{product.brand?.name} · {product.category?.name} · {product.product_media.length} photo{product.product_media.length === 1 ? '' : 's'}</p></div>
              </div>
              <div className="flex items-center gap-4"><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${product.active ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{product.active ? 'Active record' : 'Draft'}</span>{!product.active && <Link href={`/admin/products/${product.id}`} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider hover:text-[#065f46]">Edit <ArrowRight className="h-4 w-4" /></Link>}</div>
            </div>
          ))}
        </div>
        {products?.length === 200 && <p className="mt-4 text-sm text-black/50">Showing the 200 most recent products.</p>}
      </div>
    </section>
  );
}
