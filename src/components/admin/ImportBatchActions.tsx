'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ImportBatchActions({ id, valid, status }: { id: string; valid: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  async function confirm() {
    if (!window.confirm(`Create ${valid} unpublished product drafts from this batch? Existing products will not be overwritten.`)) return;
    setBusy(true); setError('');
    try {
      let remaining = valid;
      do {
        const response = await fetch(`/api/admin/imports/${id}/commit`, { method: 'POST' });
        const result = await response.json() as { imported?: number; failed?: number; remaining?: number; error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Import stopped.');
        remaining = result.remaining ?? 0;
        setProgress(`${valid - remaining} of ${valid} reviewed; ${result.failed ?? 0} failures in the last group.`);
      } while (remaining > 0);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import stopped.');
      router.refresh();
    } finally { setBusy(false); }
  }

  return <div className="flex flex-wrap items-center gap-3">
    {['READY', 'IMPORTING'].includes(status) && valid > 0 && <button type="button" disabled={busy} onClick={() => void confirm()}
      className="rounded-full bg-[#065f46] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50">{busy ? 'Importing…' : 'Confirm create-only import'}</button>}
    <a href={`/api/admin/imports/${id}/errors`} className="rounded-full border border-black px-6 py-3 text-xs font-bold uppercase tracking-wider hover:bg-black hover:text-white">Download error workbook</a>
    {progress && <span role="status" className="text-xs text-black/60">{progress}</span>}
    {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
  </div>;
}
