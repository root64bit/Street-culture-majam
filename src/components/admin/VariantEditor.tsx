'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
type Variant = {
  id: string;
  size: string;
  size_system: string;
  sku: string | null;
  color: string | null;
  active: boolean;
  price_override: number | null;
};
export function VariantEditor({ productId, variant }: { productId: string; variant: Variant }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/products/${productId}/variants/${variant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: form.get('size'),
          sizeSystem: form.get('system'),
          sku: form.get('sku'),
          color: form.get('color'),
          priceOverride: form.get('price') ? Number(form.get('price')) : null,
          active: form.get('active') === 'on',
        }),
      });
      const body: { error?: string } = await response.json();
      setMessage(
        response.ok
          ? 'Variant saved. Existing listing prices are unchanged.'
          : (body.error ?? 'Save failed.')
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage('Save failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary className="cursor-pointer text-xs font-bold text-[#126347]">Edit variant</summary>
      <form
        onSubmit={submit}
        className="mt-3 grid gap-3 rounded-xl bg-[#f7faf5] p-4 sm:grid-cols-2"
      >
        {[
          { name: 'size', label: 'Size', value: variant.size },
          { name: 'sku', label: 'SKU', value: variant.sku ?? '' },
          { name: 'color', label: 'Color', value: variant.color ?? '' },
        ].map((v) => (
          <label key={v.name} className="text-xs font-bold text-[#61766b]">
            {v.label}
            <input
              name={v.name}
              defaultValue={v.value}
              required={v.name === 'size'}
              maxLength={100}
              className="mt-1 block w-full rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
            />
          </label>
        ))}
        <label className="text-xs font-bold text-[#61766b]">
          System
          <select
            name="system"
            defaultValue={variant.size_system}
            className="mt-1 block w-full rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
          >
            {['US', 'UK', 'EU', 'CM', 'STANDARD'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-[#61766b]">
          Future inventory price hint (MZN)
          <input
            name="price"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={variant.price_override ?? ''}
            className="mt-1 block w-full rounded-lg border border-[#dce6dc] bg-white p-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-[#61766b]">
          Active
          <input
            name="active"
            type="checkbox"
            defaultChecked={variant.active}
            className="ml-2 accent-[#065f46]"
          />
        </label>
        <div className="sm:col-span-2">
          {message && (
            <p role="status" className="mb-2 text-xs">
              {message}
            </p>
          )}
          <button
            disabled={busy}
            className="rounded-lg bg-[#0d211a] px-4 py-2 text-xs font-bold text-white"
          >
            {busy ? 'Saving…' : 'Save variant'}
          </button>
        </div>
      </form>
    </details>
  );
}
