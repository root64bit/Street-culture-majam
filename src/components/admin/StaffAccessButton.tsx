'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StaffAccessButton({ userId, disabled }: { userId: string; disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/staff/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, disable: !disabled, reason }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) setError(body.error ?? 'Access change failed.');
      else {
        setOpen(false);
        setReason('');
        router.refresh();
      }
    } catch {
      setError('Access change failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] font-bold text-[#9d482c]"
      >
        {disabled ? 'Enable admin access' : 'Disable admin access'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-2 rounded-xl bg-[#fff6ee] p-3">
          <label className="block text-[11px] font-bold">
            Reason
            <textarea
              required
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-1 block w-full rounded border border-[#decfc3] bg-white p-2 text-xs"
            />
          </label>
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy || reason.trim().length < 10}
            className="mt-2 rounded bg-[#8f3f21] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : disabled ? 'Enable access' : 'Confirm disable'}
          </button>
        </form>
      )}
    </div>
  );
}
