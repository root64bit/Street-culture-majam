'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function ImportUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/admin/imports', { method: 'POST', body: form });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? 'Upload failed.');
      router.push(`/admin/imports/${result.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally { setBusy(false); }
  }

  return <form onSubmit={upload} className="rounded-3xl border border-black/10 bg-white p-6 sm:p-8">
    <h2 className="text-xl font-black">Upload Excel</h2>
    <p className="mt-2 text-sm text-black/55">Validate up to 500 products. Uploading does not create catalog items.</p>
    <input type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      onChange={(event) => setFile(event.target.files?.[0] ?? null)} aria-label="Excel workbook"
      className="mt-5 block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-5 file:py-3 file:text-white" />
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button disabled={busy || !file} className="mt-5 rounded-full bg-[#065f46] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50">{busy ? 'Validating…' : 'Upload & preview'}</button>
  </form>;
}
