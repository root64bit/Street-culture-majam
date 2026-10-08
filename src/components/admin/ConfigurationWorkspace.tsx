import { requireCapabilitiesPage } from '@/lib/admin/access';
import {
  commonCatalogFields,
  configurationCapabilities,
  type FormField,
} from '@/lib/admin/configuration';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { ConfigurationForm } from '@/components/admin/ConfigurationForm';
import { CommissionCalculator } from '@/components/admin/CommissionCalculator';

type Kind = 'brand' | 'category' | 'shipping' | 'commission';
const paths: Record<Kind, string> = {
  brand: 'brands',
  category: 'categories',
  shipping: 'shipping',
  commission: 'commissions',
};
type RecordView = {
  id: string;
  title: string;
  subtitle: string;
  active: boolean;
  values: Record<string, string | number | boolean>;
};
export async function ConfigurationWorkspace({
  kind,
  searchParams,
}: {
  kind: Kind;
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const path = `/admin/${paths[kind]}`;
  const permission =
    kind === 'commission'
      ? 'commissions.read'
      : kind === 'shipping'
        ? 'shipping.read'
        : configurationCapabilities[kind];
  const { supabase } = await requireCapabilitiesPage(path, [permission]);
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  const q = (params.q ?? '').trim().slice(0, 100).replaceAll('%', '').replaceAll('_', '');
  const status = ['active', 'inactive'].includes(params.status ?? '') ? params.status! : '';
  const pageSize = 20;
  const start = (page - 1) * pageSize;
  const [manage, brands, categories] = await Promise.all([
    supabase.rpc('has_capability', { check_capability: configurationCapabilities[kind] }),
    supabase.from('brands').select('id,name').order('name').limit(500),
    supabase.from('categories').select('id,name').order('name').limit(500),
  ]);
  const optionList = (items: { id: string; name: string }[] | null) => [
    { value: '', label: 'All / none' },
    ...(items ?? []).map((v) => ({ value: v.id, label: v.name })),
  ];
  let fields: FormField[] = [];
  let defaults: Record<string, string | number | boolean> = {};
  let records: RecordView[] = [];
  let count = 0;
  if (kind === 'brand') {
    fields = [...commonCatalogFields, { name: 'featured', label: 'Featured', type: 'checkbox' }];
    defaults = {
      name: '',
      slug: '',
      description: '',
      imagePath: '',
      active: true,
      sortOrder: 0,
      featured: false,
    };
    let query = supabase.from('brands').select('*,products(count)', { count: 'exact' });
    if (q) query = query.ilike('name', `%${q}%`);
    if (status) query = query.eq('active', status === 'active');
    const result = await query
      .order('sort_order')
      .order('name')
      .range(start, start + pageSize - 1);
    if (result.error) throw new Error('Brands are temporarily unavailable.');
    count = result.count ?? 0;
    records = (result.data ?? []).map((v) => ({
      id: v.id,
      title: v.name,
      subtitle: `/${v.slug} · ${v.products[0]?.count ?? 0} products`,
      active: v.active,
      values: {
        name: v.name,
        slug: v.slug,
        description: v.description ?? '',
        imagePath: v.logo_path ?? '',
        active: v.active,
        sortOrder: v.sort_order,
        featured: v.featured,
      },
    }));
  } else if (kind === 'category') {
    fields = [
      ...commonCatalogFields,
      { name: 'parentId', label: 'Parent category', options: optionList(categories.data) },
    ];
    defaults = {
      name: '',
      slug: '',
      description: '',
      imagePath: '',
      parentId: '',
      active: true,
      sortOrder: 0,
    };
    let query = supabase.from('categories').select('*,products(count)', { count: 'exact' });
    if (q) query = query.ilike('name', `%${q}%`);
    if (status) query = query.eq('active', status === 'active');
    const result = await query
      .order('sort_order')
      .order('name')
      .range(start, start + pageSize - 1);
    if (result.error) throw new Error('Categories are temporarily unavailable.');
    count = result.count ?? 0;
    records = (result.data ?? []).map((v) => ({
      id: v.id,
      title: v.name,
      subtitle: `/${v.slug} · Parent: ${categories.data?.find((p) => p.id === v.parent_id)?.name ?? 'Root'} · ${v.products[0]?.count ?? 0} products`,
      active: v.active,
      values: {
        name: v.name,
        slug: v.slug,
        description: v.description ?? '',
        imagePath: v.image_path ?? '',
        parentId: v.parent_id ?? '',
        active: v.active,
        sortOrder: v.sort_order,
      },
    }));
  } else if (kind === 'shipping') {
    fields = [
      { name: 'name', label: 'Method name', required: true },
      { name: 'code', label: 'Unique method code', required: true },
      { name: 'countryCode', label: 'Country ISO code (MZ / ZA / PT)', required: true },
      { name: 'region', label: 'Region (blank = entire country)' },
      {
        name: 'price',
        label: 'Checkout price (MZN)',
        type: 'number',
        step: '0.01',
        required: true,
      },
      { name: 'minDays', label: 'Minimum delivery days', type: 'number', step: '1' },
      { name: 'maxDays', label: 'Maximum delivery days', type: 'number', step: '1' },
      { name: 'active', label: 'Available at checkout', type: 'checkbox' },
    ];
    defaults = {
      name: '',
      code: '',
      countryCode: 'MZ',
      region: '',
      price: 0,
      minDays: 1,
      maxDays: 7,
      active: false,
    };
    let query = supabase.from('shipping_methods').select('*', { count: 'exact' });
    if (q) query = query.ilike('name', `%${q}%`);
    if (status) query = query.eq('active', status === 'active');
    const result = await query
      .order('country_code')
      .order('name')
      .range(start, start + pageSize - 1);
    if (result.error) throw new Error('Shipping methods are temporarily unavailable.');
    count = result.count ?? 0;
    records = (result.data ?? []).map((v) => ({
      id: v.id,
      title: v.name,
      subtitle: `${v.country_code} ${v.region ?? ''} · ${v.price.toLocaleString()} ${v.currency} · ${v.estimated_min_days}–${v.estimated_max_days} days`,
      active: v.active,
      values: {
        name: v.name,
        code: v.code,
        countryCode: v.country_code,
        region: v.region ?? '',
        price: v.price,
        minDays: v.estimated_min_days,
        maxDays: v.estimated_max_days,
        active: v.active,
      },
    }));
  } else {
    fields = [
      { name: 'name', label: 'Rule name', required: true },
      {
        name: 'sellerType',
        label: 'Seller tier',
        options: ['STANDARD', 'VERIFIED', 'PROFESSIONAL'].map((v) => ({ value: v, label: v })),
      },
      { name: 'brandId', label: 'Brand scope', options: optionList(brands.data) },
      { name: 'categoryId', label: 'Category scope', options: optionList(categories.data) },
      {
        name: 'percentage',
        label: 'Platform percentage',
        type: 'number',
        step: '0.01',
        required: true,
      },
      { name: 'fixedFee', label: 'Fixed fee (MZN)', type: 'number', step: '0.01' },
      { name: 'minimumFee', label: 'Minimum fee (MZN)', type: 'number', step: '0.01' },
      { name: 'priority', label: 'Priority (highest applies first)', type: 'number', step: '1' },
      { name: 'startsAt', label: 'Effective from', type: 'datetime-local', required: true },
      { name: 'endsAt', label: 'Effective until', type: 'datetime-local' },
      { name: 'active', label: 'Active', type: 'checkbox' },
    ];
    defaults = {
      name: '',
      sellerType: 'STANDARD',
      brandId: '',
      categoryId: '',
      percentage: 30,
      fixedFee: 0,
      minimumFee: 0,
      priority: 0,
      startsAt: new Date().toISOString().slice(0, 16),
      endsAt: '',
      active: true,
    };
    let query = supabase.from('commission_rules').select('*', { count: 'exact' });
    if (q) query = query.ilike('name', `%${q}%`);
    if (status) query = query.eq('active', status === 'active');
    const result = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .range(start, start + pageSize - 1);
    if (result.error) throw new Error('Commission rules are temporarily unavailable.');
    count = result.count ?? 0;
    records = (result.data ?? []).map((v) => ({
      id: v.id,
      title: v.name,
      subtitle: `${v.seller_type} · ${v.percentage}% + ${v.fixed_fee} ${v.currency} · minimum ${v.minimum_fee} · priority ${v.priority}`,
      active: v.active,
      values: {
        name: v.name,
        sellerType: v.seller_type,
        brandId: v.brand_id ?? '',
        categoryId: v.category_id ?? '',
        percentage: v.percentage,
        fixedFee: v.fixed_fee,
        minimumFee: v.minimum_fee,
        priority: v.priority,
        startsAt: v.starts_at.slice(0, 16),
        endsAt: v.ends_at?.slice(0, 16) ?? '',
        active: v.active,
      },
    }));
  }
  const title = paths[kind][0].toUpperCase() + paths[kind].slice(1);
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#087456]">
        Operational configuration
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">{title}</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        {kind === 'shipping'
          ? 'Prices come from the database at checkout. Orders retain their original shipping snapshot.'
          : kind === 'commission'
            ? 'New sales use the matching rule. Existing orders and payouts retain their immutable commission snapshots.'
            : 'Manage the canonical catalog taxonomy. Deactivate records without deleting linked products.'}
      </p>
      {manage.data && (
        <details className="mt-6 rounded-2xl border border-[#dce6dc] bg-white p-5">
          <summary className="cursor-pointer text-sm font-black text-[#065f46]">
            + Add {kind}
          </summary>
          <div className="mt-4">
            <ConfigurationForm kind={kind} fields={fields} values={defaults} />
          </div>
        </details>
      )}
      {kind === 'commission' && <CommissionCalculator />}
      <form method="get" className="mt-6 flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          aria-label="Search names"
          placeholder="Search names"
          className="rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          aria-label="Status"
          className="rounded-lg border border-[#dce6dc] bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="rounded-lg bg-[#0d211a] px-5 py-2 text-xs font-bold text-white">
          Filter
        </button>
      </form>
      <div className="mt-5 rounded-2xl border border-[#dce6dc] bg-white">
        {records.map((record) => (
          <article key={record.id} className="border-b border-[#e7ede4] p-5">
            <div className="flex justify-between gap-4">
              <div>
                <h2 className="text-sm font-black">{record.title}</h2>
                <p className="mt-1 text-xs text-[#61766b]">{record.subtitle}</p>
              </div>
              <span
                className={`h-fit rounded-full px-3 py-1 text-[10px] font-bold ${record.active ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}
              >
                {record.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            {manage.data && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-[#126347]">
                  Edit configuration
                </summary>
                <div className="mt-3">
                  <ConfigurationForm
                    kind={kind}
                    recordId={record.id}
                    fields={fields.map((field) =>
                      field.name === 'parentId'
                        ? { ...field, options: field.options?.filter((v) => v.value !== record.id) }
                        : field
                    )}
                    values={record.values}
                  />
                </div>
              </details>
            )}
          </article>
        ))}
        {!records.length && (
          <p className="p-12 text-center text-sm text-[#61766b]">
            No {paths[kind]} match these filters.
          </p>
        )}
        <AdminPagination
          basePath={path}
          page={page}
          count={count}
          pageSize={pageSize}
          filters={{ q, status }}
        />
      </div>
    </section>
  );
}
