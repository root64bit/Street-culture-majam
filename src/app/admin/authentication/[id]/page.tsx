import Image from 'next/image';
import { AuthenticationInspection } from '@/components/admin/AuthenticationInspection';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AuthenticationDecision } from '@/components/admin/AuthenticationDecision';
import { requireCapabilitiesPage } from '@/lib/admin/access';

export default async function AuthenticationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireCapabilitiesPage(`/admin/authentication/${id}`, [
    'authentication.review',
  ]);
  const record = await supabase
    .from('authentication_records')
    .select(
      'id,status,authenticator_id,assigned_to,priority,inspection_checklist,style_review,comparison_notes,condition_confirmed,decision_notes,authenticated_at,consignment_submission_id,consignment_submissions(id,brand_name,product_name,size,size_system,condition,purchase_year,seller_notes,status)'
    )
    .eq('id', id)
    .maybeSingle();
  if (record.error) throw new Error('Authentication record is temporarily unavailable.');
  if (!record.data?.consignment_submission_id || !record.data.consignment_submissions) notFound();
  const item = record.data.consignment_submissions;
  const { data: media, error } = await supabase
    .from('consignment_media')
    .select('id,photo_type,storage_path')
    .eq('consignment_submission_id', item.id)
    .order('sort_order');
  if (error) throw new Error('Authentication evidence is temporarily unavailable.');
  const evidence = await supabase
    .from('authentication_evidence')
    .select('id,storage_path,caption,created_at')
    .eq('record_id', id)
    .order('created_at');
  const template = await supabase.rpc('authentication_inspection_template');
  if (evidence.error || template.error) throw new Error('Inspection workspace unavailable.');
  const savedChecks = record.data.inspection_checklist as Record<string, boolean>;
  const checkNames = Array.isArray(template.data)
    ? template.data.filter((value): value is string => typeof value === 'string')
    : [];
  const checks = Object.keys(savedChecks).length
    ? savedChecks
    : Object.fromEntries(checkNames.map((name) => [name, false]));
  const evidenceUrls = evidence.data?.length
    ? await supabase.storage.from('authentication-evidence').createSignedUrls(
        evidence.data.map((photo) => photo.storage_path),
        300
      )
    : null;
  if (evidenceUrls?.error) throw new Error('Private evidence unavailable.');
  const privateUrls = new Map(
    (evidenceUrls?.data ?? []).map((photo) => [photo.path, photo.signedUrl])
  );
  const signed = media?.length
    ? await supabase.storage.from('consignment-media').createSignedUrls(
        media.map((photo) => photo.storage_path),
        300
      )
    : null;
  const urls = new Map((signed?.data ?? []).map((photo) => [photo.path, photo.signedUrl]));
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <Link
        href="/admin/authentication"
        className="text-xs font-bold text-[#087456] hover:underline"
      >
        ← Authentication queue
      </Link>
      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#087456]">
        Physical verification
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">
        {item.brand_name} {item.product_name}
      </h1>
      <p className="mt-2 text-sm text-[#61766b]">
        {record.data.status.replaceAll('_', ' ')} · {item.size_system} {item.size} · Seller reported{' '}
        {item.condition}
      </p>
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Evidence gallery</h2>
            {media?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {media.map((photo) => {
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
                            alt={`${photo.photo_type.toLowerCase()} verification view`}
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-[#718278]">
                            {url ? 'Document evidence' : 'Unavailable'}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between p-3 text-xs font-bold">
                        <span>{photo.photo_type.replaceAll('_', ' ')}</span>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#087456]"
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
              <p className="mt-4 text-sm text-[#718278]">
                No seller photos uploaded. Inspect the physical item before deciding.
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-[#e0e9e1] bg-white p-5">
            <h2 className="text-lg font-black">Seller claim and inspection</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#718278]">Reported condition</dt>
                <dd className="font-semibold">{item.condition}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#718278]">Purchase year</dt>
                <dd className="font-semibold">{item.purchase_year ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#718278]">Confirmed condition</dt>
                <dd className="font-semibold">{record.data.condition_confirmed ?? 'Pending'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#718278]">Reviewer</dt>
                <dd className="font-mono text-xs">
                  {record.data.authenticator_id ?? 'Unassigned'}
                </dd>
              </div>
            </dl>
            {item.seller_notes && (
              <p className="mt-4 whitespace-pre-wrap border-t border-[#edf1ec] pt-4 text-sm">
                {item.seller_notes}
              </p>
            )}
            {record.data.decision_notes && (
              <p className="mt-4 whitespace-pre-wrap border-t border-[#edf1ec] pt-4 text-sm">
                {record.data.decision_notes}
              </p>
            )}
          </section>
        </div>
        <div className="space-y-6">
          <AuthenticationInspection
            id={id}
            checks={checks}
            styleNote={record.data.style_review}
            comparisonNote={record.data.comparison_notes}
            priority={record.data.priority}
            closed={['PASSED', 'FAILED'].includes(record.data.status)}
          />
          {Boolean(evidence.data?.length) && (
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="text-lg font-black">Private inspection evidence</h2>
              {evidence.data?.map((photo) => (
                <a
                  key={photo.id}
                  href={privateUrls.get(photo.storage_path) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-sm text-[#087456] underline"
                >
                  {photo.caption} · {new Date(photo.created_at).toLocaleDateString()}
                </a>
              ))}
            </section>
          )}
          <AuthenticationDecision key={record.data.status} id={record.data.id} status={record.data.status} />
          <Link
            href={`/admin/consignments/${item.id}`}
            className="block rounded-2xl border border-[#e0e9e1] bg-white p-5 text-sm font-bold text-[#087456] hover:bg-[#f6fbf5]"
          >
            Open complete consignment record →
          </Link>
        </div>
      </div>
    </section>
  );
}
