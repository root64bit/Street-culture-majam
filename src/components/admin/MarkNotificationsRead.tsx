'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export function MarkNotificationsRead({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function mark() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error('Failed');
      router.refresh();
    } catch {
      setError('Could not mark alerts as read.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={mark}
        disabled={busy || !ids.length}
        className="rounded-lg border border-[#b9cfbe] px-4 py-2 text-xs font-bold text-[#126347] disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Mark this page as read'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
