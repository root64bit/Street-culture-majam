import Link from 'next/link';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { pageNumber, validId } from '@/lib/admin/filters';
import { notFound } from 'next/navigation';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { ImportBatchActions } from '@/components/admin/ImportBatchActions';
import type { ImportIssue } from '@/lib/admin/product-import';

export default async function AdminImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { id } = await params;
  if (!validId(id)) notFound();
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  const size = 30;
  const status = ['VALID', 'INVALID', 'IMPORTED', 'FAILED', 'SKIPPED'].includes(
    filters.status ?? ''
  )
    ? filters.status!
    : '';
  const { supabase } = await requireCapabilitiesPage(`/admin/imports/${id}`, ['products.import']);
  const [{ data: batch }, { data: rows, error, count }, { count: valid }] = await Promise.all([
    supabase.from('product_import_batches').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('product_import_rows')
      .select(
        'id,row_number,raw_data,normalized_data,validation_errors,validation_warnings,status,product_id',
        { count: 'exact' }
      )
      .eq('batch_id', id)
      .in(
        'status',
        status ? [status] : ['PENDING', 'VALID', 'INVALID', 'IMPORTED', 'FAILED', 'SKIPPED']
      )
      .order('row_number')
      .range((page - 1) * size, page * size - 1),
    supabase
      .from('product_import_rows')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', id)
      .eq('status', 'VALID'),
  ]);
  if (!batch || error) notFound();
  return (
    <section className="px-4 pb-20 pt-8 text-[#17251f] sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin/imports"
          className="text-xs font-bold uppercase tracking-wider text-black/50"
        >
          ← Import history
        </Link>
        <h1 className="mt-6 text-4xl font-black tracking-[-0.06em] sm:text-6xl">IMPORT PREVIEW.</h1>
        <p className="mt-2 text-sm text-black/55">
          {batch.source_filename} · {batch.status} · create-only · uploaded{' '}
          {new Date(batch.created_at).toLocaleString()}
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Total', batch.total_rows],
            ['Valid', batch.valid_rows],
            ['Invalid', batch.invalid_rows],
            ['Imported', batch.imported_rows],
            ['Failed', batch.failed_rows],
          ].map(([label, count]) => (
            <div key={label} className="rounded-2xl bg-white p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">
                {label}
              </p>
              <p className="mt-2 text-3xl font-black">{count}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Dry run: {valid ?? 0} valid rows would create unpublished products and draft listings. No
          existing product is updated. Review price, identity, and media before publication.
        </p>
        <div className="mt-5">
          <ImportBatchActions id={id} valid={valid ?? 0} status={batch.status} />
        </div>
        <form className="mt-6 flex gap-3">
          <label className="text-xs font-bold">
            Row status
            <select name="status" defaultValue={status} className="ml-2 rounded-lg border p-2">
              <option value="">All</option>
              {['VALID', 'INVALID', 'IMPORTED', 'FAILED', 'SKIPPED'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg border px-4 text-xs font-bold">Filter</button>
        </form>
        <div className="mt-8 overflow-x-auto rounded-3xl border border-black/10 bg-white">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-[#efede6] text-[10px] uppercase tracking-wider">
              <tr>
                <th className="p-4">Row</th>
                <th className="p-4">Reference</th>
                <th className="p-4">Product</th>
                <th className="p-4">Asking MZN</th>
                <th className="p-4">Status</th>
                <th className="p-4">Validation</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row) => {
                const raw = row.raw_data as Record<string, string>;
                const issues = [
                  ...(row.validation_errors as unknown as ImportIssue[]),
                  ...(row.validation_warnings as unknown as ImportIssue[]),
                ];
                return (
                  <tr key={row.id} className="border-t border-black/10 align-top">
                    <td className="p-4">{row.row_number}</td>
                    <td className="p-4 font-mono text-xs">{raw.product_reference}</td>
                    <td className="p-4">{raw.product_name}</td>
                    <td className="p-4">{raw.selling_price}</td>
                    <td className="p-4 font-bold">{row.status}</td>
                    <td className="p-4 text-xs">
                      {issues.length
                        ? issues.map((issue, index) => (
                            <p
                              key={index}
                              className={
                                index < (row.validation_errors as unknown as ImportIssue[]).length
                                  ? 'text-red-700'
                                  : 'text-amber-800'
                              }
                            >
                              {issue.field}: {issue.error}
                              {issue.suggested ? ` Suggested: ${issue.suggested}` : ''}
                            </p>
                          ))
                        : 'Ready to create'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <AdminPagination
            basePath={`/admin/imports/${id}`}
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
