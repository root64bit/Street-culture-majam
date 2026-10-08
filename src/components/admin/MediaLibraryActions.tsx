'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export function MediaLibraryUpload({ bucket }: { bucket: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('file');
    if (!(file instanceof File) || !file.size) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setMessage('Use PNG, JPEG or WebP under 10 MB.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const extension =
        file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp';
      const path = `library/${crypto.randomUUID()}.${extension}`;
      const result = await createClient()
        .storage.from(bucket)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (result.error) throw new Error('Upload rejected.');
      setMessage(`Uploaded: ${path}`);
      router.refresh();
    } catch {
      setMessage('Upload failed. Check your permission and file format.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={upload}
      className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[#dce6dc] bg-white p-4"
    >
      <label className="text-xs font-bold text-[#61766b]">
        Upload public asset
        <input
          name="file"
          type="file"
          required
          accept="image/png,image/jpeg,image/webp"
          className="mt-2 block text-xs"
        />
      </label>
      <button
        disabled={busy}
        className="rounded-lg bg-[#0d211a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Upload'}
      </button>
      {message && (
        <p role="status" className="w-full break-all text-xs">
          {message}
        </p>
      )}
    </form>
  );
}
export function MediaLibraryActions({
  bucket,
  path,
  used,
}: {
  bucket: string;
  path: string;
  used: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function remove() {
    if (!window.confirm('Delete this unused public asset permanently? This cannot be undone.'))
      return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, path }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Removal failed.');
      router.refresh();
    } catch {
      setMessage('Removal rejected. Attached files cannot be deleted.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(path);
            setMessage('Storage path copied.');
          } catch {
            setMessage(path);
          }
        }}
        className="text-[11px] font-bold text-[#126347]"
      >
        Copy path
      </button>
      {!used && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-[11px] font-bold text-red-700 disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete unused'}
        </button>
      )}
      {message && (
        <p role="status" className="w-full break-all text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
