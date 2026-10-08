'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PayoutActions({
  id,
  status,
  canApprove,
  canMarkPaid,
}: {
  id: string;
  status: string;
  canApprove: boolean;
  canMarkPaid: boolean;
}) {
  const router = useRouter();
  const choices =
    (status === 'PENDING' || status === 'FAILED') && canApprove
      ? [['APPROVE', status === 'FAILED' ? 'Retry / re-approve' : 'Approve']]
      : status === 'APPROVED' && canApprove
        ? [
            ['MARK_PROCESSING', 'Mark processing'],
            ['MARK_FAILED', 'Mark failed'],
          ]
        : status === 'PROCESSING'
          ? [
              ...(canMarkPaid ? [['MARK_PAID', 'Record payment']] : []),
              ...(canApprove ? [['MARK_FAILED', 'Mark failed']] : []),
            ]
          : [];
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(choices[0]?.[0] ?? '');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!choices.length) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/payouts/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note, method, reference }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) setError(body.error ?? 'Payout could not be updated.');
      else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError('Payout could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-44">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-[#cbded0] px-3 py-2 text-[11px] font-bold text-[#126347]"
      >
        {open ? 'Close' : 'Review payout'}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl bg-[#eff7eb] p-3">
          <label className="block text-[11px] font-bold">
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="mt-1 block w-full rounded border border-[#cbded0] bg-white p-2 text-xs"
            >
              {choices.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {action === 'MARK_PAID' && (
            <>
              <label className="block text-[11px] font-bold">
                External method
                <input
                  required
                  minLength={2}
                  maxLength={50}
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="mt-1 block w-full rounded border border-[#cbded0] bg-white p-2 text-xs"
                />
              </label>
              <label className="block text-[11px] font-bold">
                Transaction reference
                <input
                  required
                  minLength={6}
                  maxLength={100}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  className="mt-1 block w-full rounded border border-[#cbded0] bg-white p-2 text-xs"
                />
              </label>
            </>
          )}
          <label className="block text-[11px] font-bold">
            Operator note
            <textarea
              required
              minLength={10}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-1 block w-full rounded border border-[#cbded0] bg-white p-2 text-xs"
            />
          </label>
          {error && (
            <p role="alert" className="text-[11px] text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy || note.trim().length < 10}
            className="rounded bg-[#0d211a] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save audited action'}
          </button>
        </form>
      )}
    </div>
  );
}
