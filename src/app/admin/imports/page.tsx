import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/access';
import { ImportUpload } from '@/components/admin/ImportUpload';

export default async function AdminImportsPage() {
  const { supabase } = await requireAdminPage('/admin/imports');
  const { data: batches, error } = await supabase.from('product_import_batches')
    .select('id,source_filename,status,total_rows,valid_rows,invalid_rows,imported_rows,created_at')
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error('Import history is temporarily unavailable.');
  return <section className="min-h-screen bg-[#fbfaf6] px-4 pb-24 pt-32 text-black sm:px-6 lg:px-10">
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/products" className="text-xs font-bold uppercase tracking-wider text-black/50">← Products</Link>
      <h1 className="mt-6 text-5xl font-black tracking-[-0.07em] sm:text-7xl">BULK IMPORT.</h1>
      <p className="mt-3 text-sm text-black/55">Create-only, staged import. Nothing goes live automatically.</p>
      <a href="/templates/street-culture-product-import.xlsx" download className="mt-8 inline-flex rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white">Download product import template</a>
      <div className="mt-6"><ImportUpload /></div>
      <h2 className="mt-12 text-xl font-black">Import history</h2>
      <div className="mt-4 overflow-hidden rounded-3xl border border-black/10 bg-white">
        {!batches?.length ? <p className="p-6 text-sm text-black/50">No imports yet.</p> : batches.map((batch) => <Link href={`/admin/imports/${batch.id}`} key={batch.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-5 text-sm last:border-0 hover:bg-[#f6f5f2]">
          <span><strong className="block">{batch.source_filename}</strong><span className="mt-1 block text-xs text-black/45">{new Date(batch.created_at).toLocaleString()} · {batch.total_rows} rows · {batch.valid_rows} valid · {batch.invalid_rows} invalid · {batch.imported_rows} imported</span></span>
          <span className="rounded-full bg-[#efede6] px-3 py-1 text-[10px] font-bold uppercase">{batch.status}</span>
        </Link>)}
      </div>
    </div>
  </section>;
}
