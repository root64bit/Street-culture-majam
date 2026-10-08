'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
type Photo = { id: string; storage_path: string; sort_order: number; alt_text: string | null };
export function ProductMediaEditor({
  productId,
  name,
  photos,
  editable,
}: {
  productId: string;
  name: string;
  photos: Photo[];
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function operate(payload: object) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/products/${productId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body: { error?: string } = await response.json();
      setMessage(response.ok ? 'Photos updated.' : (body.error ?? 'Photos could not be updated.'));
      if (response.ok) router.refresh();
    } catch {
      setMessage('Photos could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const files = new FormData(form)
      .getAll('photos')
      .filter((v): v is File => v instanceof File && v.size > 0);
    if (
      !files.length ||
      photos.length + files.length > 100 ||
      files.some(
        (file) =>
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          file.size > 10 * 1024 * 1024
      )
    ) {
      setMessage(
        'Choose PNG, JPEG, or WebP files under 10 MB each. Maximum 100 photos per product.'
      );
      return;
    }
    setBusy(true);
    setMessage('');
    const client = createClient();
    let added = 0;
    try {
      for (const file of files) {
        const extension =
          file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp';
        const path = `${productId}/${crypto.randomUUID()}.${extension}`;
        const uploaded = await client.storage
          .from('product-images')
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploaded.error) throw new Error('Upload failed.');
        const attached = await client
          .from('product_media')
          .insert({
            product_id: productId,
            storage_path: path,
            media_type: 'IMAGE',
            sort_order: photos.length + added,
            alt_text: `${name} — photo ${photos.length + added + 1}`,
          });
        if (attached.error) {
          await client.storage.from('product-images').remove([path]);
          throw new Error('Photo could not be attached.');
        }
        added++;
      }
      form.reset();
      setMessage(`${added} photos uploaded.`);
    } catch {
      setMessage(
        `${added} photos added. Remaining uploads failed; choose the remaining files again.`
      );
    } finally {
      setBusy(false);
      router.refresh();
    }
  }
  return (
    <div>
      <p className="text-sm text-[#61766b]">
        First photo is primary. Removing a photo detaches it; unused files can be removed from the
        media library. The last photo of a live item is protected.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo, index) => {
          const url = photo.storage_path.startsWith('/')
            ? photo.storage_path
            : createClient().storage.from('product-images').getPublicUrl(photo.storage_path).data
                .publicUrl;
          return (
            <div key={photo.id} className="rounded-xl border border-[#dce6dc] bg-white p-3">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-[#f2f3ed]">
                <Image
                  src={url}
                  alt={photo.alt_text ?? name}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-contain"
                />
              </div>
              <p className="my-2 text-xs font-bold">
                {index === 0 ? 'PRIMARY' : `Photo ${index + 1}`}
              </p>
              {editable ? (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void operate({
                        action: 'ALT_TEXT',
                        mediaId: photo.id,
                        altText: new FormData(event.currentTarget).get('alt'),
                      });
                    }}
                    className="flex gap-2"
                  >
                    <input
                      name="alt"
                      aria-label={`Photo ${index + 1} description`}
                      defaultValue={photo.alt_text ?? ''}
                      required
                      maxLength={300}
                      className="min-w-0 flex-1 rounded-lg border p-2 text-xs"
                    />
                    <button disabled={busy} className="text-xs font-bold">
                      Save alt
                    </button>
                  </form>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
                    {index > 0 && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void operate({
                            action: 'REORDER',
                            ids: [
                              photo.id,
                              ...photos.filter((p) => p.id !== photo.id).map((p) => p.id),
                            ],
                          })
                        }
                      >
                        Set primary
                      </button>
                    )}
                    {index < photos.length - 1 && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          const ids = photos.map((p) => p.id);
                          [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
                          void operate({ action: 'REORDER', ids });
                        }}
                      >
                        Move right
                      </button>
                    )}
                    <button
                      disabled={busy}
                      aria-label={`Remove photo ${index + 1}`}
                      className="text-red-700"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Detach this product photo? Its file will remain in the media library.'
                          )
                        )
                          void operate({ action: 'REMOVE', mediaId: photo.id });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs">{photo.alt_text}</p>
              )}
            </div>
          );
        })}
      </div>
      {!photos.length && <p className="my-6 text-sm">No product photos yet.</p>}
      {editable && (
        <form
          onSubmit={upload}
          className="mt-5 flex flex-wrap items-center gap-4 rounded-xl bg-white p-4"
        >
          <input
            type="file"
            name="photos"
            accept="image/png,image/jpeg,image/webp"
            multiple
            required
            disabled={busy}
            aria-label="Upload product photos"
          />
          <button
            disabled={busy}
            className="rounded-lg bg-[#0d211a] px-5 py-3 text-xs font-bold text-white"
          >
            {busy ? 'Saving…' : 'Upload photos'}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
