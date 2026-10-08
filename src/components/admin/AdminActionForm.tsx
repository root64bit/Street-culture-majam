'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FormField } from '@/lib/admin/configuration';

export function AdminActionForm({
  endpoint,
  actions,
  fields = [],
  label = 'Record action',
}: {
  endpoint: string;
  actions: { value: string; label: string }[];
  fields?: FormField[];
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { action: form.get('action'), note: form.get('note') };
    for (const field of fields)
      body[field.name] =
        field.type === 'number' ? Number(form.get(field.name)) : (form.get(field.name) ?? '');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result: { error?: string } = await response.json();
      setMessage(response.ok ? 'Saved and audited.' : (result.error ?? 'Action failed.'));
      if (response.ok) router.refresh();
    } catch {
      setMessage('Action failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (!actions.length) return null;
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-[#dce6dc] bg-[#f7faf5] p-4"
    >
      <label className="block text-xs font-bold text-[#536d5e]">
        Action
        <select
          name="action"
          className="mt-1 block w-full rounded-lg border border-[#cfded2] bg-white p-2 text-sm"
        >
          {actions.map((action) => (
            <option key={action.value} value={action.value}>
              {action.label}
            </option>
          ))}
        </select>
      </label>
      {fields.map((field) => (
        <label key={field.name} className="block text-xs font-bold text-[#536d5e]">
          {field.label}
          {field.options ? (
            <select
              required={field.required}
              name={field.name}
              className="mt-1 block w-full rounded-lg border border-[#cfded2] bg-white p-2 text-sm"
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type ?? 'text'}
              name={field.name}
              required={field.required}
              step={field.step}
              className="mt-1 block w-full rounded-lg border border-[#cfded2] bg-white p-2 text-sm"
            />
          )}
        </label>
      ))}
      <label className="block text-xs font-bold text-[#536d5e]">
        Reason / internal note
        <textarea
          name="note"
          required
          minLength={10}
          maxLength={1000}
          rows={3}
          className="mt-1 block w-full rounded-lg border border-[#cfded2] bg-white p-2 text-sm"
        />
      </label>
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
      <button
        disabled={busy}
        className="rounded-lg bg-[#0d211a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : label}
      </button>
    </form>
  );
}
