import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConsignmentActions } from '@/components/admin/ConsignmentActions';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { AdminActionForm } from '@/components/admin/AdminActionForm';

export default async function ConsignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireCapabilitiesPage(`/admin/consignments/${id}`, [
    'consignments.read',
  ]);
  const [submission, media, authRecords, listings, reviewAllowed, auditAllowed] = await Promise.all(
    [
      supabase.from('consignment_submissions').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('consignment_media')
        .select('id,photo_type,storage_path,sort_order')
        .eq('consignment_submission_id', id)
        .order('sort_order'),
      supabase
        .from('authentication_records')
        .select('id,status,condition_confirmed,decision_notes,authenticated_at,created_at')
        .eq('consignment_submission_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('listings')
        .select('id,status,asking_price,currency,sold_at')
        .eq('consignment_submission_id', id),
      supabase.rpc('has_capability', { check_capability: 'consignments.review' }),
      supabase.rpc('has_capability', { check_capability: 'audit.read' }),
    ]
  );
  if (
    submission.error ||
    media.error ||
    authRecords.error ||
    listings.error ||
    reviewAllowed.error ||
    auditAllowed.error
  )
    throw new Error('Consignment detail is temporarily unavailable.');
  if (!submission.data) notFound();
  const item = submission.data;
  const [canList, storeContext] = await Promise.all([
    supabase.rpc('has_capability', { check_capability: 'inventory.manage' }),
    supabase.rpc('operational_store_context'),
  ]);
  const returnInstructions =
    storeContext.data &&
    typeof storeContext.data === 'object' &&
    !Array.isArray(storeContext.data) &&
    typeof (storeContext.data as { consignment?: { returnInstructions?: unknown } }).consignment
      ?.returnInstructions === 'string'
      ? (storeContext.data as { consignment: { returnInstructions: string } }).consignment
          .returnInstructions
      : null;
  const compatibleSystems = ['ONE_SIZE', 'ONE SIZE', 'STANDARD'].includes(item.size_system)
    ? [item.size_system, 'STANDARD']
    : [item.size_system];
  const matchingVariants =
    canList.data && ['AUTHENTICATED', 'PHOTOGRAPHY', 'PRICING'].includes(item.status)
      ? await supabase
          .from('product_variants')
          .select('id,size,size_system,products!inner(name,archived_at)')
          .eq('size', item.size)
          .eq('active', true)
          .in('size_system', compatibleSystems)
          .is('products.archived_at', null)
          .limit(200)
      : null;
  const audit = auditAllowed.data
    ? await supabase
        .from('admin_audit_logs')
        .select('id,action,metadata,created_at')
        .eq('entity_type', 'consignment')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(30)
    : null;
  if (audit?.error) throw new Error('Consignment timeline is temporarily unavailable.');
  const signed = media.data?.length
    ? await supabase.storage.from('consignment-media').createSignedUrls(
        media.data.map((photo) => photo.storage_path),
        300
      )
    : null;
  const urls = new Map((signed?.data ?? []).map((photo) => [photo.path, photo.signedUrl]));

  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <Link href="/admin/consignments" className="text-xs font-bold text-[#087456] hover:underline">
        ← All consignments
      </Link>
      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Consignment / {id.slice(0, 8)}
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">
        {item.brand_name} {item.product_name}
      </h1>
      <p className="mt-2 text-sm text-[#61766b]">
        {item.status.replaceAll('_', ' ')} · Submitted{' '}
        {item.submitted_at ? new Date(item.submitted_at).toLocaleString('en-GB') : 'not yet'}
      </p>
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Item details</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              {[
                ['Brand', item.brand_name],
                ['Product', item.product_name],
                ['Size', `${item.size_system} ${item.size}`],
                ['Condition', item.condition],
                [
                  'Expected price',
                  new Intl.NumberFormat('pt-MZ', {
                    style: 'currency',
                    currency: item.currency,
                  }).format(item.expected_price),
                ],
                ['Purchase year', item.purchase_year ?? 'Not provided'],
                ['Delivery', item.delivery_method],
                ['Seller', item.seller_id],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-[#718278]">{label}</dt>
                  <dd className="mt-1 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {item.seller_notes && (
              <div className="mt-5 border-t border-[#edf1ec] pt-4">
                <p className="text-xs font-bold text-[#718278]">Seller notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.seller_notes}</p>
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Seller evidence</h2>
            {media.data?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {media.data.map((photo) => {
                  const url = urls.get(photo.storage_path);
                  const isImage = /\.(jpe?g|png|webp)$/i.test(photo.storage_path);
                  return (
                    <div
                      key={photo.id}
                      className="overflow-hidden rounded-xl border border-[#edf1ec]"
                    >
                      <div className="relative aspect-square bg-[#f4f7f3]">
                        {url && isImage ? (
                          <Image
                            src={url}
                            alt={`${photo.photo_type.toLowerCase()} view`}
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-[#718278]">
                            {url ? 'Document' : 'Evidence unavailable'}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between p-3 text-xs font-bold">
                        <span>{photo.photo_type.replaceAll('_', ' ')}</span>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#087456] hover:underline"
                          >
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#718278]">No photos uploaded.</p>
            )}
          </section>
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Authentication and listing</h2>
            <div className="mt-4 space-y-3 text-sm">
              {authRecords.data?.length ? (
                authRecords.data.map((record) => (
                  <div key={record.id} className="rounded-xl bg-[#f4f7f3] p-3">
                    <strong>{record.status.replaceAll('_', ' ')}</strong>
                    <p className="mt-1 text-xs text-[#718278]">
                      {record.decision_notes ?? 'Decision pending'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-[#718278]">Authentication has not started.</p>
              )}
              {listings.data?.length ? (
                listings.data.map((listing) => (
                  <div key={listing.id} className="rounded-xl bg-[#f4f7f3] p-3">
                    <strong>Listing {listing.status}</strong>
                    <p className="mt-1 text-xs text-[#718278]">
                      {new Intl.NumberFormat('pt-MZ', {
                        style: 'currency',
                        currency: listing.currency,
                      }).format(listing.asking_price)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-[#718278]">No listing created yet.</p>
              )}
            </div>
          </section>
        </div>
        <div className="space-y-6">
          {reviewAllowed.data && <ConsignmentActions key={item.status} id={item.id} status={item.status} />}
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Handling</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {[
                ['Approved', item.approved_at],
                ['Received', item.received_at],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-[#718278]">{label}</dt>
                  <dd className="font-semibold">
                    {value ? new Date(value).toLocaleString('en-GB') : 'Not yet'}
                  </dd>
                </div>
              ))}
            </dl>
            {item.internal_notes && (
              <p className="mt-4 whitespace-pre-wrap border-t border-[#edf1ec] pt-4 text-sm">
                {item.internal_notes}
              </p>
            )}
          </section>
          {auditAllowed.data && (
            <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
              <h2 className="text-lg font-black">Audit trail</h2>
              {audit?.data?.length ? (
                <ol className="mt-4 space-y-3">
                  {audit.data.map((entry) => (
                    <li key={entry.id} className="border-l-2 border-[#dcebe0] pl-3">
                      <p className="text-xs font-bold">{entry.action.replaceAll('_', ' ')}</p>
                      <p className="mt-1 text-[11px] text-[#718278]">
                        {new Date(entry.created_at).toLocaleString('en-GB')}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-[#718278]">No review actions yet.</p>
              )}
            </section>
          )}
        </div>
      </div>
      {reviewAllowed.data &&
        [
          'RECEIVED',
          'AUTHENTICATION_FAILED',
          'AUTHENTICATED',
          'READY_TO_LIST',
          'REJECTED',
          'RETURN_REQUESTED',
        ].includes(item.status) && (
          <section className="mt-6 max-w-xl rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="mb-2 text-lg font-black">Return handling</h2>
            {returnInstructions && (
              <p className="mb-4 text-xs text-[#61766b]">{returnInstructions}</p>
            )}
            <AdminActionForm
              endpoint={`/api/admin/consignments/${id}/return`}
              actions={[
                {
                  value: item.status === 'RETURN_REQUESTED' ? 'CONFIRM_RETURN' : 'REQUEST_RETURN',
                  label:
                    item.status === 'RETURN_REQUESTED'
                      ? 'Confirm physical return to seller'
                      : 'Request return to seller',
                },
              ]}
            />
          </section>
        )}
      {reviewAllowed.data &&
        canList.data &&
        ['AUTHENTICATED', 'PHOTOGRAPHY', 'PRICING'].includes(item.status) && (
          <section className="mt-6 max-w-xl rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="mb-3 text-lg font-black">Create sellable inventory</h2>
            <p className="mb-4 text-sm text-[#61766b]">
              Match the actual model and size to its canonical product. This creates an unpublished
              unit. Upload public product photography, then activate it in Inventory. Private
              authentication evidence stays private.
            </p>
            {matchingVariants?.data?.length ? (
              <AdminActionForm
                endpoint={`/api/admin/consignments/${id}/listing`}
                actions={[
                  { value: 'CREATE_LISTING', label: 'Create authenticated consignment draft' },
                ]}
                fields={[
                  {
                    name: 'variantId',
                    label: 'Canonical product / variant',
                    required: true,
                    options: matchingVariants.data.map((v) => ({
                      value: v.id,
                      label: `${v.products?.name} — ${v.size_system} ${v.size}`,
                    })),
                  },
                  {
                    name: 'price',
                    label: 'Approved selling price (MZN)',
                    type: 'number',
                    step: '0.01',
                    required: true,
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-[#61766b]">
                No matching size exists. Create the canonical product and variant in Products first.
              </p>
            )}
          </section>
        )}
    </section>
  );
}
