'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConfigurationKind, FormField } from '@/lib/admin/configuration';

export function ConfigurationForm({
  kind,
  recordId = null,
  fields,
  values,
  settingKey,
}: {
  kind: ConfigurationKind;
  recordId?: string | null;
  fields: FormField[];
  values: Record<string, string | number | boolean>;
  settingKey?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = form.get(field.name);
      payload[field.name] =
        field.type === 'checkbox'
          ? raw === 'on'
          : field.type === 'number'
            ? Number(raw)
            : String(raw ?? '');
      if (field.type === 'datetime-local' && raw)
        payload[field.name] = new Date(String(raw)).toISOString();
    }
    if (kind === 'shipping' || kind === 'commission') payload.currency = 'MZN';
    if (settingKey === 'authentication')
      payload.checklist = String(payload.checklist)
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
    try {
      const response = await fetch(`/api/admin/configuration/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: recordId,
          payload: settingKey ? { key: settingKey, value: payload } : payload,
        }),
      });
      const body: { error?: string; field?: string } = await response.json();
      setMessage(
        response.ok
          ? 'Saved. Change recorded in the audit log.'
          : `${body.field ? `${body.field}: ` : ''}${body.error ?? 'Save failed.'}`
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage('Save failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="grid gap-4 rounded-xl bg-[#f7faf5] p-5 sm:grid-cols-2">
      {fields.map((field) => (
        <label
          key={field.name}
          className={`text-xs font-bold text-[#536d5e] ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
        >
          {field.label}
          {field.type === 'checkbox' ? (
            <input
              name={field.name}
              type="checkbox"
              defaultChecked={Boolean(values[field.name])}
              className="ml-3 accent-[#065f46]"
            />
          ) : field.options ? (
            <select
              name={field.name}
              defaultValue={String(values[field.name] ?? '')}
              className="mt-1 block w-full rounded-lg border border-[#cfded2] bg-white p-2.5 text-sm text-[#17251f]"
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              name={field.name}
              defaultValue={String(values[field.name] ?? '')}
              required={field.required}
              rows={3}
              maxLength={2000}
              className="mt-1 block w-full rounded-lg border border-[#cfded2] bg-white p-2.5 text-sm text-[#17251f]"
            />
          ) : (
            <input
              name={field.name}
              type={field.type ?? 'text'}
              defaultValue={String(values[field.name] ?? '')}
              required={field.required}
              step={field.step}
              maxLength={500}
              className="mt-1 block w-full rounded-lg border border-[#cfded2] bg-white p-2.5 text-sm text-[#17251f]"
            />
          )}
        </label>
      ))}
      <div className="sm:col-span-2">
        {message && (
          <p role="status" className="mb-3 text-sm">
            {message}
          </p>
        )}
        <button
          disabled={busy}
          className="rounded-lg bg-[#0d211a] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save configuration'}
        </button>
      </div>
    </form>
  );
}
