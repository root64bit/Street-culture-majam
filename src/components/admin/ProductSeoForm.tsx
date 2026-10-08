'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export function ProductSeoForm({
  productId,
  slug,
  metaTitle,
  metaDescription,
  retailPrice,
  currency,
}: {
  productId: string;
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  retailPrice: number | null;
  currency: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/products/${productId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: form.get('slug'),
          metaTitle: form.get('metaTitle'),
          metaDescription: form.get('metaDescription'),
          retailPrice: form.get('retailPrice') ? Number(form.get('retailPrice')) : null,
        }),
      });
      const body: { error?: string } = await response.json();
      setMessage(response.ok ? 'Metadata saved.' : (body.error ?? 'Save failed.'));
      if (response.ok) router.refresh();
    } catch {
      setMessage('Save failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-2xl border border-[#dce6dc] bg-white p-6 sm:grid-cols-2"
    >
      {[
        { name: 'slug', label: 'URL slug (unpublish before changing)', value: slug, max: 160 },
        { name: 'metaTitle', label: 'SEO title', value: metaTitle ?? '', max: 160 },
        {
          name: 'metaDescription',
          label: 'SEO description',
          value: metaDescription ?? '',
          max: 320,
        },
      ].map((v) => (
        <label key={v.name} className="text-xs font-bold text-[#61766b]">
          {v.label}
          <input
            name={v.name}
            defaultValue={v.value}
            required={v.name === 'slug'}
            maxLength={v.max}
            className="mt-1 block w-full rounded-lg border border-[#dce6dc] p-3 text-sm"
          />
        </label>
      ))}
      <label className="text-xs font-bold text-[#61766b]">
        Retail reference price ({currency})
        <input
          name="retailPrice"
          type="number"
          min={0.01}
          step="0.01"
          max={9999999999.99}
          defaultValue={retailPrice ?? ''}
          className="mt-1 block w-full rounded-lg border border-[#dce6dc] p-3 text-sm"
        />
      </label>
      <p className="text-xs text-[#718278] sm:col-span-2">
        Retail is informational. Actual selling prices belong to individual inventory listings.
      </p>
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
          {busy ? 'Saving…' : 'Save metadata'}
        </button>
      </div>
    </form>
  );
}
