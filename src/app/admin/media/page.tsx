import Image from 'next/image';
import Link from 'next/link';
import { requireCapabilitiesPage } from '@/lib/admin/access';
import { pageNumber } from '@/lib/admin/filters';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { MediaLibraryActions, MediaLibraryUpload } from '@/components/admin/MediaLibraryActions';
export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; bucket?: string; q?: string }>;
}) {
  const { supabase } = await requireCapabilitiesPage('/admin/media', ['media.manage']);
  const params = await searchParams;
  const bucket = ['product-images', 'brand-assets', 'editorial-assets'].includes(
    params.bucket ?? ''
  )
    ? params.bucket!
    : 'product-images';
  const page = pageNumber(params.page);
  const q = (params.q ?? '').slice(0, 120);
  const pageSize = 24;
  const { data, error } = await supabase.rpc('admin_public_media_library', {
    asset_bucket: bucket,
    search_text: q,
    page_offset: (page - 1) * pageSize,
    page_limit: pageSize,
  });
  if (error) throw new Error('Media library is temporarily unavailable.');
  return (
    <section className="px-4 pb-20 pt-8 sm:px-7 lg:px-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#087456]">
        Catalog / Assets
      </p>
      <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">Public media library</h1>
      <p className="mt-2 text-sm text-[#61766b]">
        Product photography, brand assets and editorial files. Attached assets are protected.
        Private consignment and authentication evidence are not listed here.
      </p>
      <form method="get" className="mt-6 flex flex-wrap gap-3">
        <select
          name="bucket"
          defaultValue={bucket}
          aria-label="Asset bucket"
          className="rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
        >
          {['product-images', 'brand-assets', 'editorial-assets'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search storage path"
          aria-label="Search media"
          className="rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
        />
        <button className="rounded-lg bg-[#0d211a] px-5 py-2 text-xs font-bold text-white">
          Search
        </button>
      </form>
      <MediaLibraryUpload bucket={bucket} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data?.map((asset) => {
          const url = supabase.storage.from(asset.bucket).getPublicUrl(asset.path).data.publicUrl;
          const usage = Array.isArray(asset.usage) ? asset.usage : [];
          return (
            <article
              key={asset.id}
              className="overflow-hidden rounded-2xl border border-[#dce6dc] bg-white"
            >
              <div className="relative aspect-square bg-[#f1f5ed]">
                {['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type) ? (
                  <Image
                    src={url}
                    alt={asset.path.split('/').at(-1) ?? 'Public asset'}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-[#61766b]">
                    {asset.mime_type}
                  </span>
                )}
              </div>
              <div className="p-4">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-xs font-bold text-[#154b34] hover:underline"
                >
                  {asset.path}
                </a>
                <p className="mt-2 text-[11px] text-[#718278]">
                  {(asset.bytes / 1024).toFixed(1)} KB ·{' '}
                  {new Date(asset.created_at).toLocaleDateString('en-GB')}
                </p>
                <div className="mt-2 space-y-1">
                  {usage.map((entry, index) =>
                    entry &&
                    typeof entry === 'object' &&
                    !Array.isArray(entry) &&
                    typeof entry.href === 'string' &&
                    typeof entry.label === 'string' ? (
                      <Link
                        key={index}
                        href={entry.href}
                        className="block text-[11px] font-bold text-[#087456]"
                      >
                        Used: {entry.label}
                      </Link>
                    ) : null
                  )}
                  {!usage.length && <p className="text-[11px] text-[#718278]">Unused</p>}
                </div>
                <MediaLibraryActions
                  bucket={asset.bucket}
                  path={asset.path}
                  used={usage.length > 0}
                />
              </div>
            </article>
          );
        })}
      </div>
      {!data?.length && (
        <p className="mt-6 rounded-2xl border border-[#dce6dc] bg-white p-12 text-center text-sm text-[#61766b]">
          No assets match these filters.
        </p>
      )}
      <AdminPagination
        basePath="/admin/media"
        page={page}
        count={data?.[0]?.total_count ?? 0}
        pageSize={pageSize}
        filters={{ bucket, q }}
      />
    </section>
  );
}
