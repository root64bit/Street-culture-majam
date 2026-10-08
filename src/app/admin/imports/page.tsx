import Link from 'next/link';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { pageNumber } from '@/lib/admin/filters';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { ImportUpload } from '@/components/admin/ImportUpload';

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  const size = 30;
  const status = ['READY', 'IMPORTING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(
    filters.status ?? ''
  )
    ? filters.status!
    : '';
  const { supabase } = await requireCapabilitiesPage('/admin/imports', ['products.import']);
  const {
    data: batches,
    error,
    count,
  } = await supabase
    .from('product_import_batches')
    .select(
      'id,source_filename,status,total_rows,valid_rows,invalid_rows,imported_rows,created_at',
      { count: 'exact' }
    )
    .in(
      'status',
      status
        ? [status]
        : [
            'UPLOADED',
            'VALIDATING',
            'READY',
            'IMPORTING',
            'COMPLETED',
            'PARTIAL',
            'FAILED',
            'CANCELLED',
          ]
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (error) throw new Error('Import history is temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 text-[#17251f] sm:px-7 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin/products"
          className="text-xs font-bold uppercase tracking-wider text-black/50"
        >
          ← Products
        </Link>
        <h1 className="mt-6 text-5xl font-black tracking-[-0.07em] sm:text-7xl">BULK IMPORT.</h1>
        <p className="mt-3 text-sm text-black/55">
          Create-only, staged import. Nothing goes live automatically.
        </p>
        <a
          href="/api/admin/imports/template"
          download
          className="mt-8 inline-flex rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white"
        >
          Download product import template
        </a>
        <div className="mt-6">
          <ImportUpload />
        </div>
        <h2 className="mt-12 text-xl font-black">Import history</h2>
        <form className="mt-4 flex gap-3">
          <label className="text-xs font-bold">
            Status
            <select name="status" defaultValue={status} className="ml-2 rounded-lg border p-2">
              <option value="">All</option>
              {['READY', 'IMPORTING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].map(
                (value) => (
                  <option key={value}>{value}</option>
                )
              )}
            </select>
          </label>
          <button className="rounded-lg border px-4 text-xs font-bold">Filter</button>
        </form>
        <div className="mt-4 overflow-hidden rounded-3xl border border-black/10 bg-white">
          {!batches?.length ? (
            <p className="p-6 text-sm text-black/50">No imports yet.</p>
          ) : (
            batches.map((batch) => (
              <Link
                href={`/admin/imports/${batch.id}`}
                key={batch.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-5 text-sm last:border-0 hover:bg-[#f6f5f2]"
              >
                <span>
                  <strong className="block">{batch.source_filename}</strong>
                  <span className="mt-1 block text-xs text-black/45">
                    {new Date(batch.created_at).toLocaleString()} · {batch.total_rows} rows ·{' '}
                    {batch.valid_rows} valid · {batch.invalid_rows} invalid · {batch.imported_rows}{' '}
                    imported
                  </span>
                </span>
                <span className="rounded-full bg-[#efede6] px-3 py-1 text-[10px] font-bold uppercase">
                  {batch.status}
                </span>
              </Link>
            ))
          )}
          <AdminPagination
            basePath="/admin/imports"
            page={page}
            count={count ?? 0}
            pageSize={size}
            filters={{ status }}
          />
        </div>
      </div>
    </section>
  );
}
