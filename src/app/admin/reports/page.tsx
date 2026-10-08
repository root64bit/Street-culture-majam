import Link from 'next/link';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { validDate, validId, pageNumber } from '@/lib/admin/filters';
const reports = [
  'sales',
  'orders',
  'products',
  'inventory',
  'consignments',
  'payouts',
  'payment_failures',
];
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    report?: string;
    from?: string;
    to?: string;
    currency?: string;
    brand?: string;
    category?: string;
    seller?: string;
    page?: string;
  }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/reports', ['reports.read']);
  const params = await searchParams;
  const report = reports.includes(params.report ?? '') ? params.report! : 'sales';
  const page = pageNumber(params.page);
  const pageSize = 30;
  const today = new Date().toISOString().slice(0, 10);
  const from = validDate(params.from) || `${today.slice(0, 7)}-01`;
  const to = validDate(params.to) || today;
  const currency = ['MZN', 'EUR', 'ZAR', 'USD'].includes(params.currency ?? '')
    ? params.currency!
    : 'MZN';
  const brand = validId(params.brand);
  const category = validId(params.category);
  const seller = validId(params.seller);
  const dateFrom = `${from}T00:00:00+02:00`;
  const dateTo = new Date(new Date(`${to}T00:00:00+02:00`).valueOf() + 86400000).toISOString();
  const [result, brands, categories] = await Promise.all([
    from <= to
      ? supabase.rpc('admin_operational_report', {
          report_kind: report,
          date_from: dateFrom,
          date_to: dateTo,
          currency_filter: currency,
          ...(brand ? { brand_filter: brand } : {}),
          ...(category ? { category_filter: category } : {}),
          ...(seller ? { seller_filter: seller } : {}),
          page_offset: (page - 1) * pageSize,
          page_limit: pageSize,
        })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('brands').select('id,name').order('name').limit(500),
    supabase.from('categories').select('id,name').order('name').limit(500),
  ]);
  if (result.error) throw new Error('Reports are temporarily unavailable.');
  const filters = { report, from, to, currency, brand, category, seller };
  const amountLabel =
    report === 'consignments'
      ? 'Expected price'
      : report === 'inventory'
        ? 'Asking price'
        : report === 'payouts'
          ? 'Seller net'
          : report === 'payment_failures'
            ? 'Failed attempt amount'
            : 'Amount';
  const recordLink = (id: string) =>
    report === 'products'
      ? `/admin/products/${id}`
      : report === 'sales' || report === 'orders'
        ? `/admin/orders/${id}`
        : report === 'consignments'
          ? `/admin/consignments/${id}`
          : report === 'payouts'
            ? '/admin/payouts'
            : report === 'inventory'
              ? '/admin/inventory'
              : '/admin/payments';
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#087456]">
        Operations / Reports
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Business records</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Database-backed records, one currency at a time. Sales exclude refunds. Inventory reflects
        current stock regardless of date.
      </p>
      <form
        method="get"
        className="mt-7 grid gap-3 rounded-2xl border border-[#dce6dc] bg-white p-4 sm:grid-cols-3 xl:grid-cols-4"
      >
        <label className="text-xs font-bold text-[#61766b]">
          Report
          <select
            name="report"
            defaultValue={report}
            className="mt-1 block w-full rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
          >
            {reports.map((v) => (
              <option key={v} value={v}>
                {v.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        {[
          { name: 'from', label: 'From', value: from },
          { name: 'to', label: 'Through', value: to },
        ].map((v) => (
          <label key={v.name} className="text-xs font-bold text-[#61766b]">
            {v.label}
            <input
              name={v.name}
              type="date"
              defaultValue={v.value}
              className="mt-1 block w-full rounded-lg border border-[#dce6dc] p-2 text-sm"
            />
          </label>
        ))}
        <label className="text-xs font-bold text-[#61766b]">
          Currency
          <select
            name="currency"
            defaultValue={currency}
            className="mt-1 block w-full rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
          >
            {['MZN', 'EUR', 'ZAR', 'USD'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {[
          { name: 'brand', label: 'Brand', value: brand, items: brands.data },
          { name: 'category', label: 'Category', value: category, items: categories.data },
        ].map((v) => (
          <label key={v.name} className="text-xs font-bold text-[#61766b]">
            {v.label}
            <select
              name={v.name}
              defaultValue={v.value}
              className="mt-1 block w-full rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
            >
              <option value="">All</option>
              {v.items?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="text-xs font-bold text-[#61766b]">
          Seller ID
          <input
            name="seller"
            defaultValue={seller}
            placeholder="Optional UUID"
            className="mt-1 block w-full rounded-lg border border-[#dce6dc] p-2 text-sm"
          />
        </label>
        <button className="self-end rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-bold text-white">
          Run report
        </button>
      </form>
      {from > to && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          End date must follow start date.
        </p>
      )}
      <div className="mt-5 rounded-2xl border border-[#dce6dc] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
              <tr>
                {['Record', 'Units', amountLabel, 'State'].map((v) => (
                  <th key={v} className="px-5 py-4">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1ec]">
              {result.data?.map((row) => (
                <tr key={row.record_id}>
                  <td className="px-5 py-4">
                    <Link
                      href={recordLink(row.record_id)}
                      className="font-bold text-[#154b34] hover:underline"
                    >
                      {row.label}
                    </Link>
                  </td>
                  <td className="px-5 py-4 tabular-nums">{row.units}</td>
                  <td className="px-5 py-4 font-bold tabular-nums">
                    {row.amount.toLocaleString()} {row.currency}
                  </td>
                  <td className="px-5 py-4 text-xs">{row.status.replaceAll('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!result.data?.length && (
          <p className="p-12 text-center text-sm text-[#61766b]">No records in this report.</p>
        )}
        <AdminPagination
          basePath="/admin/reports"
          page={page}
          count={result.data?.[0]?.total_count ?? 0}
          pageSize={pageSize}
          filters={filters}
        />
      </div>
    </section>
  );
}
