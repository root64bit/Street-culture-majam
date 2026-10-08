'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const actions: Record<string, { value: string; label: string }[]> = {
  SUBMITTED: [{ value: 'START_REVIEW', label: 'Start review' }],
  UNDER_REVIEW: [
    { value: 'REQUEST_INFO', label: 'Request more information' },
    { value: 'APPROVE', label: 'Approve for delivery' },
    { value: 'REJECT', label: 'Reject submission' },
  ],
  APPROVED_FOR_DELIVERY: [
    { value: 'AWAIT_ITEM', label: 'Awaiting item' },
    { value: 'MARK_RECEIVED', label: 'Mark physically received' },
  ],
  AWAITING_ITEM: [{ value: 'MARK_RECEIVED', label: 'Mark physically received' }],
  IN_TRANSIT: [{ value: 'MARK_RECEIVED', label: 'Mark physically received' }],
  RECEIVED: [{ value: 'SEND_TO_AUTH', label: 'Send to authentication' }],
};

export function ConsignmentActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const available = actions[status] ?? [];
  const [action, setAction] = useState(available[0]?.value ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!available.length) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/consignments/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) setError(body.error ?? 'The review could not be saved.');
      else {
        setNotes('');
        router.refresh();
      }
    } catch {
      setError('The review could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#dce8d7] bg-[#eff7eb] p-5">
      <h2 className="text-lg font-black">Review action</h2>
      <p className="mt-1 text-xs text-[#61766b]">
        Each transition is checked against the current status and recorded in the audit log.
      </p>
      <label className="mt-4 block text-xs font-bold text-[#61766b]">
        Action
        <select
          value={action}
          onChange={(event) => setAction(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-[#cbded0] bg-white px-3 py-2.5 text-sm text-[#173829]"
        >
          {available.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block text-xs font-bold text-[#61766b]">
        Reason / inspection note
        <textarea
          required
          minLength={10}
          maxLength={1000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className="mt-1 block w-full rounded-lg border border-[#cbded0] bg-white px-3 py-2.5 text-sm text-[#173829]"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={busy || notes.trim().length < 10}
        className="mt-4 rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save transition'}
      </button>
    </form>
  );
}
