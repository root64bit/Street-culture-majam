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
import { ProductEditModeButton } from '@/components/admin/ProductEditModeButton';
import { ListingConditionEditor } from '@/components/admin/ListingConditionEditor';
import { AdminActionForm } from '@/components/admin/AdminActionForm';
import { ListingCostEditor } from '@/components/admin/ListingCostEditor';
import type { InventoryCostPrice } from '@/lib/finance/inventory-cost';
const tabs = ['all', 'general', 'variants', 'media', 'listings', 'pricing', 'seo', 'history'];
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
  const tab = tabs.includes(filters.tab ?? '') ? filters.tab! : 'all';
  const show = (section: string) => tab === 'all' || tab === section;
  const page = pageNumber(filters.page);
  const pageSize = 30;
  const { supabase } = await requireCapabilitiesPage(`/admin/products/${id}`, ['products.read']);
  const caps = await supabase.rpc('my_capabilities');
  if (caps.error) throw new Error('Permissions unavailable.');
  const can = (value: string) => caps.data?.some((cap) => cap.capability === value) ?? false;
  const [product, brands, categories, diagnostics] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).maybeSingle(),
    supabase.from('brands').select('id,name').eq('active', true).order('name'),
    supabase.from('categories').select('id,name').eq('active', true).order('sort_order'),
    supabase.rpc('admin_product_publication_diagnostics', { target_product_id: id }).maybeSingle(),
  ]);
  if (product.error || brands.error || categories.error) {
    console.error('Product query failed:', product.error || brands.error || categories.error);
    throw new Error('Product unavailable.');
  }
  if (diagnostics.error) {
    console.warn('Diagnostics query warning:', diagnostics.error);
  }
  if (!product.data) notFound();
  const record = product.data;
  const visibility = diagnostics.data;
  const basePath = `/admin/products/${id}`;
  const photos =
    show('media') || show('general')
      ? await supabase
          .from('product_media')
          .select('id,storage_path,sort_order,alt_text')
          .eq('product_id', id)
          .order('sort_order')
          .limit(100)
      : null;
  const variants = show('variants')
    ? await supabase.rpc('admin_product_variants', {
        target_product_id: id,
        page_offset: (page - 1) * pageSize,
        page_limit: pageSize,
      })
    : null;
  const listings =
    show('listings') && can('inventory.read')
      ? await supabase
          .from('listings')
          .select('*,product_variants(size,size_system)', { count: 'exact' })
          .eq('product_id', id)
          .order('created_at', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1)
      : null;
  const pricing = show('pricing')
    ? await supabase.rpc('admin_product_pricing', { target_product_id: id }).maybeSingle()
    : null;
  const privateCosts =
    show('listings') && can('finance.read') && listings?.data?.length
      ? await supabase
          .from('inventory_cost_prices')
          .select('listing_id,amount,currency,mzn_per_unit,amount_mzn,reference,revision')
          .in(
            'listing_id',
            listings.data.map((listing) => listing.id)
          )
      : null;
  const history =
    show('history') && can('audit.read')
      ? await supabase
          .from('admin_audit_logs')
          .select('id,actor_id,action,metadata,created_at', { count: 'exact' })
          .eq('entity_id', id)
          .order('created_at', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1)
      : null;
  if ([photos, variants, listings, pricing, history, privateCosts].some((result) => result?.error))
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
          <p className="mt-2 text-sm text-[#61766b]">
            Edit details, photos, sizes, listing prices and SEO in this workspace.
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
      {visibility && (
        <div
          className={`mt-6 rounded-2xl border p-5 ${visibility.publicly_visible ? 'border-[#8bbf93] bg-[#eff9ed]' : 'border-[#e3c584] bg-[#fff8e8]'}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em]">
                {visibility.publicly_visible ? 'Publicly visible' : 'Not public — action required'}
              </p>
              <p className="mt-2 text-sm text-[#61766b]">
                Publication stage: {visibility.stage.replaceAll('_', ' ')} ·{' '}
                {visibility.media_count} images · {visibility.active_variant_count} active variants
                · {visibility.live_listing_count} live listings
              </p>
            </div>
            {visibility.publicly_visible && (
              <Link
                href={`/products/${record.slug}`}
                className="rounded-full bg-[#0d211a] px-4 py-2 text-xs font-bold text-white"
              >
                Preview product
              </Link>
            )}
          </div>
          {!visibility.publicly_visible && visibility.blocker_messages.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {visibility.blocker_messages.map((message, index) => {
                const code = visibility.blocker_codes[index] ?? 'METADATA';
                const targetTab =
                  code === 'MEDIA'
                    ? 'media'
                    : code === 'VARIANT'
                      ? 'variants'
                      : ['LISTING', 'AUTHENTICATION', 'PUBLICATION'].includes(code)
                        ? 'listings'
                        : 'general';
                return (
                  <li
                    key={`${code}-${message}`}
                    className="rounded-xl bg-white/70 p-3 text-xs leading-5"
                  >
                    <strong>{message}</strong>{' '}
                    <Link
                      href={`${basePath}?tab=${targetTab}`}
                      className="text-[#065f46] underline underline-offset-2"
                    >
                      Fix this
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
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
      {record.active && can('products.write') && show('general') && (
        <div className="mb-6 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm">
            This product is active. Unpublish available listings to unlock its identity fields.
            Photos and available listing prices have their own editors below; reserved or sold items
            remain protected.
          </p>
          {can('inventory.manage') ? (
            <ProductEditModeButton productId={id} />
          ) : (
            <p className="text-sm">Ask an inventory manager to prepare this product for editing.</p>
          )}
        </div>
      )}
      {show('general') && <h2 className="mt-8 text-xl font-black">Product details</h2>}
      {show('general') &&
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
      {show('variants') && <h2 className="mb-4 mt-10 text-xl font-black">Sizes and variants</h2>}
      {show('variants') && (
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
      {show('general') && can('products.write') && (
        <div className="my-8 max-w-2xl space-y-3">
          <h2 className="text-xl font-black">Storefront placement</h2>
          <p className="text-sm text-[#61766b]">
            Featured: {record.featured ? 'Yes' : 'No'} · Most Wanted:{' '}
            {record.most_wanted ? 'Yes' : 'No'}. Placement does not publish inventory.
          </p>
          <AdminActionForm
            endpoint="/api/admin/products/bulk"
            payload={{ ids: [id] }}
            label="Save placement"
            actions={[
              {
                value: record.featured ? 'UNFEATURE' : 'FEATURE',
                label: record.featured ? 'Remove featured placement' : 'Feature product',
              },
              {
                value: record.most_wanted ? 'REMOVE_MOST_WANTED' : 'MOST_WANTED',
                label: record.most_wanted ? 'Remove from Most Wanted' : 'Add to Most Wanted',
              },
            ]}
          />
        </div>
      )}
      {show('media') && <h2 className="mb-4 mt-10 text-xl font-black">Photos and media</h2>}
      {show('media') && (
        <ProductMediaEditor
          productId={id}
          name={record.name}
          photos={photos?.data ?? []}
          editable={can('media.manage')}
        />
      )}
      {show('listings') && (
        <h2 className="mb-4 mt-10 text-xl font-black">Listings, condition and asking prices</h2>
      )}
      {show('listings') && (
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
                        <td className="min-w-72 p-4">
                          {money(listing.asking_price)}
                          {can('finance.read') && listing.ownership_type === 'STREET_CULTURE' && (
                            <ListingCostEditor
                              key={`${listing.id}-${privateCosts?.data?.find((cost) => cost.listing_id === listing.id)?.revision ?? 0}`}
                              listingId={listing.id}
                              cost={
                                (privateCosts?.data?.find(
                                  (cost) => cost.listing_id === listing.id
                                ) as InventoryCostPrice | undefined) ?? null
                              }
                              editable={
                                can('finance.manage') && ['DRAFT', 'LIVE'].includes(listing.status)
                              }
                            />
                          )}
                        </td>
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
                          {can('inventory.manage') &&
                            listing.status === 'DRAFT' &&
                            listing.ownership_type === 'STREET_CULTURE' && (
                              <ListingConditionEditor
                                id={listing.id}
                                condition={listing.condition}
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
                  canSetPrivateCost={can('finance.manage')}
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
      {show('pricing') && <h2 className="mb-4 mt-10 text-xl font-black">Pricing overview</h2>}
      {show('pricing') && (
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
      {show('seo') && <h2 className="mb-4 mt-10 text-xl font-black">SEO and retail reference</h2>}
      {show('seo') &&
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
      {show('history') && <h2 className="mb-4 mt-10 text-xl font-black">Change history</h2>}
      {show('history') && (
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
