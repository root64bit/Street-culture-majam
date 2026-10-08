'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export function VariantGenerator({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/products/${productId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: form.get('system'),
          start: Number(form.get('start')),
          end: Number(form.get('end')),
          increment: Number(form.get('increment')),
          skuPrefix: form.get('skuPrefix'),
          color: form.get('color'),
        }),
      });
      const body: { created?: number; error?: string } = await response.json();
      setMessage(
        response.ok
          ? `${body.created} variants created. No physical units were added.`
          : (body.error ?? 'Generation failed.')
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage('Generation failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-5 rounded-xl border border-[#dce6dc] bg-[#f7faf5] p-4">
      <summary className="cursor-pointer text-sm font-bold">Generate size range</summary>
      <p className="mt-3 text-xs text-[#61766b]">
        Creates missing catalog sizes only. Add each verified physical unit through inventory
        separately. For ONE_SIZE, use 1 to 1.
      </p>
      <form onSubmit={generate} className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold">
          Size system
          <select
            name="system"
            className="mt-1 block w-full rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
          >
            {['US', 'UK', 'EU', 'CM', 'ONE_SIZE'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {[
          { name: 'start', label: 'From', value: 7 },
          { name: 'end', label: 'Through', value: 12 },
        ].map((v) => (
          <label key={v.name} className="text-xs font-bold">
            {v.label}
            <input
              type="number"
              name={v.name}
              min={0}
              max={100}
              step="0.5"
              defaultValue={v.value}
              required
              className="mt-1 block w-full rounded-lg border border-[#dce6dc] p-2 text-sm"
            />
          </label>
        ))}
        <label className="text-xs font-bold">
          Increment
          <select
            name="increment"
            className="mt-1 block w-full rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
          >
            <option value="0.5">0.5</option>
            <option value="1">1</option>
          </select>
        </label>
        {[
          { name: 'skuPrefix', label: 'SKU prefix (optional)' },
          { name: 'color', label: 'Color (optional)' },
        ].map((v) => (
          <label key={v.name} className="text-xs font-bold">
            {v.label}
            <input
              name={v.name}
              maxLength={70}
              className="mt-1 block w-full rounded-lg border border-[#dce6dc] p-2 text-sm"
            />
          </label>
        ))}
        <div className="sm:col-span-3">
          {message && (
            <p role="status" className="mb-3 text-xs">
              {message}
            </p>
          )}
          <button
            disabled={busy}
            className="rounded-lg bg-[#0d211a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate variants'}
          </button>
        </div>
      </form>
    </details>
  );
}
