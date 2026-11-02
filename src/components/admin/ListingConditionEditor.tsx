'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
export function ListingConditionEditor({ id, condition }: { id: string; condition: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/listings/${id}/condition`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition: values.get('condition'), note: values.get('note') }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Condition could not be saved.');
      setMessage('Condition saved. Inspect and authenticate this item again before publishing.');
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Condition could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary className="cursor-pointer text-xs font-bold text-[#126347]">Edit condition</summary>
      <form onSubmit={save} className="mt-3 space-y-3 rounded-xl bg-[#f7faf5] p-3">
        <label className="block text-xs font-bold">
          Condition
          <select
            name="condition"
            defaultValue={condition}
            className="mt-1 w-full rounded-lg border bg-white p-2"
          >
            {['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'].map((value) => (
              <option key={value} value={value}>
                {value.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold">
          Reason for condition correction
          <textarea
            name="note"
            required
            minLength={10}
            maxLength={1000}
            className="mt-1 w-full rounded-lg border bg-white p-2"
          />
        </label>
        <p className="text-xs">
          Changing condition requires fresh authentication before publication.
        </p>
        {message && (
          <p role="status" className="text-xs">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[#0d211a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save condition'}
        </button>
      </form>
    </details>
  );
}
