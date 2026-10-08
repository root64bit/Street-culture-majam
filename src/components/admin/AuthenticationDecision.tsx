'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AuthenticationDecision({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const actions =
    status === 'PENDING'
      ? [['START', 'Start inspection']]
      : status === 'IN_REVIEW'
        ? [
            ['PASS', 'Pass'],
            ['FAIL', 'Fail'],
            ['REQUEST_INFO', 'Request more information'],
          ]
        : [];
  const [action, setAction] = useState(actions[0]?.[0] ?? '');
  const [note, setNote] = useState('');
  const [condition, setCondition] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!actions.length) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/authentication/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note, condition }),
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) setError(body.error ?? 'Decision could not be saved.');
      else {
        setNote('');
        router.refresh();
      }
    } catch {
      setError('Decision could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#dce8d7] bg-[#eff7eb] p-5">
      <h2 className="text-lg font-black">Record inspection</h2>
      <p className="mt-1 text-xs text-[#61766b]">
        Only a qualified reviewer can make this decision; the record and item state change together.
      </p>
      <label className="mt-4 block text-xs font-bold">
        Decision
        <select
          aria-label="Decision"
          value={action}
          onChange={(event) => setAction(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-[#cbded0] bg-white p-2.5 text-sm"
        >
          {actions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {action === 'PASS' && (
        <label className="mt-4 block text-xs font-bold">
          Confirmed condition
          <input
            required
            minLength={2}
            maxLength={100}
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-[#cbded0] bg-white p-2.5 text-sm"
          />
        </label>
      )}
      <label className="mt-4 block text-xs font-bold">
        Inspection and comparison notes
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-[#cbded0] bg-white p-2.5 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={busy || note.trim().length < 10}
        className="mt-4 rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
      >
        Save audited decision
      </button>
    </form>
  );
}
