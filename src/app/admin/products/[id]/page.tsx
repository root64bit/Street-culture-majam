import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { validId, pageNumber } from '@/lib/admin/filters';
import { ProductEditor } from '@/components/admin/ProductEditor';
import { ProductMediaEditor } from '@/components/admin/ProductMediaEditor';
import { ProductSeoForm } from '@/components/admin/ProductSeoForm';
import { VariantGenerator } from '@/components/admin/VariantGenerator';
import { VariantEditor } from '@/components/admin/VariantEditor';
import { InventoryActions } from '@/components/admin/InventoryActions';
import { StockDraftForm } from '@/components/admin/StockDraftForm';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { redactMetadata } from '@/lib/admin/redaction';
const tabs = ['general', 'variants', 'media', 'listings', 'pricing', 'seo', 'history'];
export default async function EditAdminProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  if (!validId(id)) notFound();
  const filters = await searchParams;
  const tab = tabs.includes(filters.tab ?? '') ? filters.tab! : 'general';
  const page = pageNumber(filters.page);
  const pageSize = 30;
  const { supabase } = await requireCapabilitiesPage(`/admin/products/${id}`, ['products.read']);
  const caps = await supabase.rpc('my_capabilities');
  if (caps.error) throw new Error('Permissions unavailable.');
  const can = (value: string) => caps.data?.some((cap) => cap.capability === value) ?? false;
  const [product, brands, categories] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('brands').select('id,name').eq('active', true).order('name'),
    supabase.from('categories').select('id,name').eq('active', true).order('sort_order'),
  ]);
  if (product.error || brands.error || categories.error) throw new Error('Product unavailable.');
  if (!product.data) notFound();
  const record = product.data;
  const basePath = `/admin/products/${id}`;
  const photos =
    tab === 'media' || tab === 'general'
      ? await supabase
          .from('product_media')
          .select('id,storage_path,sort_order,alt_text')
          .eq('product_id', id)
          .order('sort_order')
          .limit(100)
      : null;
  const variants =
    tab === 'variants'
      ? await supabase.rpc('admin_product_variants', {
          target_product_id: id,
          page_offset: (page - 1) * pageSize,
          page_limit: pageSize,
        })
      : null;
  const listings =
    tab === 'listings' && can('inventory.read')
      ? await supabase
          .from('listings')
          .select('*,product_variants(size,size_system)', { count: 'exact' })
          .eq('product_id', id)
          .order('created_at', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1)
      : null;
  const pricing =
    tab === 'pricing'
      ? await supabase.rpc('admin_product_pricing', { target_product_id: id }).maybeSingle()
      : null;
  const history =
    tab === 'history' && can('audit.read')
      ? await supabase
          .from('admin_audit_logs')
          .select('id,actor_id,action,metadata,created_at', { count: 'exact' })
          .eq('entity_id', id)
          .order('created_at', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1)
      : null;
  if ([photos, variants, listings, pricing, history].some((result) => result?.error))
    throw new Error('Product workspace unavailable.');
  const money = (value: number | null | undefined) =>
    value == null
      ? '—'
      : new Intl.NumberFormat('en-MZ', { style: 'currency', currency: 'MZN' }).format(value);
  return (
    <section className="p-4 sm:p-7 lg:p-10">
      <Link href="/admin/products" className="text-xs font-bold text-[#61766b]">
        ← Products
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#126347]">
            Catalog workspace ·{' '}
            {record.archived_at ? 'Archived' : record.active ? 'Active' : 'Draft'}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{record.name}</h1>
          <p className="mt-2 text-sm text-[#61766b]">
            {record.sku ?? 'No catalog SKU'} · {record.style_code ?? 'No style code'}
          </p>
        </div>
        {record.active && (
          <Link
            href={`/products/${record.slug}`}
            className="rounded-lg border px-4 py-2 text-xs font-bold"
          >
            View storefront
          </Link>
        )}
      </div>
      <nav
        aria-label="Product workspace tabs"
        className="my-6 flex gap-1 overflow-x-auto border-b border-[#dce6dc]"
      >
        {tabs.map((value) => (
          <Link
            key={value}
            href={`${basePath}?tab=${value}`}
            aria-current={value === tab ? 'page' : undefined}
            className={`whitespace-nowrap px-4 py-3 text-xs font-bold uppercase ${value === tab ? 'border-b-2 border-[#065f46] text-[#065f46]' : 'text-[#61766b]'}`}
          >
            {value}
          </Link>
        ))}
      </nav>
      {tab === 'general' &&
        (can('products.write') ? (
          <ProductEditor
            compact
            product={{ ...record, product_media: photos?.data ?? [] }}
            brands={brands.data ?? []}
            categories={categories.data ?? []}
          />
        ) : (
          <dl className="grid gap-4 rounded-2xl bg-white p-6 sm:grid-cols-2">
            {[
              ['Name', record.name],
              ['Model', record.model],
              ['Description', record.description],
              ['Colorway', record.colorway],
              ['Gender', record.gender],
              ['Release year', record.release_year],
              ['Slug', record.slug],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-bold text-[#61766b]">{label}</dt>
                <dd className="mt-2 text-sm">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        ))}
      {tab === 'variants' && (
        <div className="rounded-2xl border border-[#dce6dc] bg-white p-5">
          <p className="mb-4 text-sm text-[#61766b]">
            Quantity counts real available listings, not generated sizes. Sold or reserved variant
            identities cannot be changed.
          </p>
          {variants?.data?.map((variant) => (
            <div key={variant.id} className="border-t py-4">
              <div className="mb-2 flex flex-wrap justify-between gap-3 text-sm">
                <strong>
                  {variant.size} {variant.size_system}
                </strong>
                <span>
                  {variant.sku ?? 'No SKU'} · {variant.color ?? 'No color'}
                </span>
                <span>
                  {variant.available_count} available / {variant.live_count} live ·{' '}
                  {variant.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {can('products.write') && <VariantEditor productId={id} variant={variant} />}
            </div>
          ))}
          {!variants?.data?.length && (
            <p className="py-6 text-sm">
              No variants yet. Generate sizes or add an actual unit in Listings.
            </p>
          )}
          <AdminPagination
            basePath={basePath}
            page={page}
            count={Number(variants?.data?.[0]?.total_count ?? 0)}
            pageSize={pageSize}
            filters={{ tab }}
          />
          {can('products.write') && <VariantGenerator productId={id} />}
        </div>
      )}
      {tab === 'media' && (
        <ProductMediaEditor
          productId={id}
          name={record.name}
          photos={photos?.data ?? []}
          editable={can('media.manage')}
        />
      )}
      {tab === 'listings' && (
        <div>
          {!can('inventory.read') ? (
            <p className="p-6 text-sm">Inventory access is not included in this role.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border border-[#dce6dc] bg-white">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-[#eff4ee] text-xs uppercase">
                    <tr>
                      {[
                        'Listing / size',
                        'Ownership / seller',
                        'Condition',
                        'Price',
                        'State',
                        'Actions',
                      ].map((v) => (
                        <th key={v} className="p-4">
                          {v}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listings?.data?.map((listing) => (
                      <tr key={listing.id} className="border-t align-top">
                        <td className="p-4">
                          <p className="font-mono text-xs">{listing.id}</p>
                          <p>
                            {listing.product_variants?.size} {listing.product_variants?.size_system}
                          </p>
                        </td>
                        <td className="p-4">
                          {listing.ownership_type}
                          {listing.seller_id && (
                            <Link
                              className="mt-2 block text-xs underline"
                              href={`/admin/sellers/${listing.seller_id}`}
                            >
                              Seller profile
                            </Link>
                          )}
                        </td>
                        <td className="p-4">{listing.condition}</td>
                        <td className="p-4">{money(listing.asking_price)}</td>
                        <td className="p-4">
                          {listing.status}
                          <p className="text-xs text-[#61766b]">{listing.authentication_status}</p>
                        </td>
                        <td className="p-4">
                          {can('inventory.manage') && (
                            <InventoryActions
                              id={listing.id}
                              status={listing.status}
                              authenticationStatus={listing.authentication_status}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!listings?.data?.length && (
                  <p className="p-6 text-sm">
                    No inventory units. Add only physical items you actually hold.
                  </p>
                )}
                <AdminPagination
                  basePath={basePath}
                  page={page}
                  count={listings?.count ?? 0}
                  pageSize={pageSize}
                  filters={{ tab }}
                />
              </div>
              {can('inventory.manage') && (
                <StockDraftForm
                  key={`${id}-${page}`}
                  productId={id}
                  productArchived={Boolean(record.archived_at)}
                  canAuthenticate={can('authentication.review')}
                  initialStock={(listings?.data ?? [])
                    .filter((l) => l.ownership_type === 'STREET_CULTURE')
                    .map((l) => ({
                      ...l,
                      size: l.product_variants?.size ?? '',
                      size_system: l.product_variants?.size_system ?? '',
                    }))}
                />
              )}
            </>
          )}
        </div>
      )}
      {tab === 'pricing' && (
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            ['Retail reference', money(record.retail_price)],
            ['Lowest live', money(pricing?.data?.lowest_live)],
            ['Highest live', money(pricing?.data?.highest_live)],
            ['Recent paid sale', money(pricing?.data?.recent_sale)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-white p-6">
              <p className="text-xs font-bold text-[#61766b]">{label}</p>
              <p className="mt-3 text-2xl font-bold">{value}</p>
            </div>
          ))}
          <p className="text-xs text-[#61766b] sm:col-span-4">
            {pricing?.data?.live_units ?? 0} live units. Sale prices come from paid order snapshots;
            listing prices are adjusted in Listings.
          </p>
        </div>
      )}
      {tab === 'seo' &&
        (can('products.write') ? (
          <ProductSeoForm
            productId={id}
            slug={record.slug}
            metaTitle={record.meta_title}
            metaDescription={record.meta_description}
            retailPrice={record.retail_price}
            currency={record.currency}
          />
        ) : (
          <p className="p-6 text-sm">Catalog write access is required to edit SEO metadata.</p>
        ))}
      {tab === 'history' && (
        <div className="rounded-2xl border bg-white">
          {!can('audit.read') ? (
            <p className="p-6 text-sm">Audit access is not included in this role.</p>
          ) : (
            <>
              {history?.data?.map((event) => (
                <div key={event.id} className="border-b p-5">
                  <p className="text-sm font-bold">{event.action}</p>
                  <p className="mt-1 text-xs text-[#61766b]">
                    {new Date(event.created_at).toLocaleString()} · {event.actor_id ?? 'System'}
                  </p>
                  <pre className="mt-3 overflow-x-auto text-xs">
                    {JSON.stringify(redactMetadata(event.metadata), null, 2)}
                  </pre>
                </div>
              ))}
              {!history?.data?.length && (
                <p className="p-6 text-sm">
                  No product-level audit events yet. Variant and photo events are also available in
                  the global audit log.
                </p>
              )}
              <AdminPagination
                basePath={basePath}
                page={page}
                count={history?.count ?? 0}
                pageSize={pageSize}
                filters={{ tab }}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
