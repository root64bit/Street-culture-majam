'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
type Row = {
  id: string;
  name: string;
  brand_name: string;
  category_name: string;
  style_code: string | null;
  sku: string | null;
  active: boolean;
  archived_at: string | null;
  featured: boolean;
  most_wanted: boolean;
  updated_at: string;
  image_url: string | null;
  variants_count: number;
  live_count: number;
  lowest_price: number | null;
};
export function AdminProductTable({
  rows,
  manage,
  canExport,
  exportQuery,
}: {
  rows: Row[];
  manage: boolean;
  canExport: boolean;
  exportQuery: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function bulk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected, action: form.get('action'), note: form.get('note') }),
      });
      const body: { changed?: number; error?: string } = await response.json();
      setMessage(
        response.ok
          ? `${body.changed} products updated and audited.`
          : (body.error ?? 'Update failed.')
      );
      if (response.ok) {
        setSelected([]);
        router.refresh();
      }
    } catch {
      setMessage('Update failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {canExport && (
        <div className="mb-4 flex flex-wrap gap-3 text-xs font-bold">
          <a
            href={`/api/admin/products/export?${exportQuery}`}
            className="rounded-lg border border-[#c8d9cb] bg-white px-4 py-2 text-[#126347]"
          >
            Export current filters (.xlsx)
          </a>
          {selected.length > 0 && (
            <a
              href={`/api/admin/products/export?ids=${selected.join(',')}`}
              className="rounded-lg border border-[#c8d9cb] bg-white px-4 py-2 text-[#126347]"
            >
              Export {selected.length} selected
            </a>
          )}
        </div>
      )}
      {selected.length > 0 && manage && (
        <form
          onSubmit={bulk}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#c8d9cb] bg-[#eff7eb] p-4"
        >
          <span className="self-center text-xs font-bold">{selected.length} selected</span>
          <select
            name="action"
            aria-label="Bulk action"
            className="rounded-lg border border-[#c8d9cb] bg-white p-2 text-xs"
          >
            {[
              { value: 'FEATURE', label: 'Feature' },
              { value: 'UNFEATURE', label: 'Remove featured' },
              { value: 'MOST_WANTED', label: 'Mark Most Wanted' },
              { value: 'REMOVE_MOST_WANTED', label: 'Remove Most Wanted' },
              { value: 'ARCHIVE', label: 'Archive (available drafts only)' },
              { value: 'RESTORE_DRAFT', label: 'Restore as draft' },
            ].map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
          <input
            name="note"
            required
            minLength={10}
            maxLength={1000}
            placeholder="Reason (at least 10 characters)"
            aria-label="Bulk change reason"
            className="min-w-60 flex-1 rounded-lg border border-[#c8d9cb] bg-white p-2 text-xs"
          />
          <button
            disabled={busy}
            className="rounded-lg bg-[#0d211a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Apply'}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="mb-4 text-sm">
          {message}
        </p>
      )}
      <div className="overflow-x-auto rounded-t-2xl border border-[#dce6dc] bg-white">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="bg-[#f8faf7] text-[10px] uppercase tracking-widest text-[#6c8174]">
            <tr>
              <th className="p-4">
                {(manage || canExport) && (
                  <input
                    type="checkbox"
                    aria-label="Select this page"
                    checked={rows.length > 0 && selected.length === rows.length}
                    onChange={(event) =>
                      setSelected(event.target.checked ? rows.map((v) => v.id) : [])
                    }
                    className="accent-[#065f46]"
                  />
                )}
              </th>
              {[
                'Product',
                'Brand / Category',
                'Style / SKU',
                'Variants',
                'Live / Lowest MZN',
                'State',
                'Placement',
                'Updated',
              ].map((v) => (
                <th key={v} className="px-4 py-4">
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1ec]">
            {rows.map((product) => (
              <tr key={product.id} className="align-top hover:bg-[#fbfdf9]">
                <td className="p-4">
                  {(manage || canExport) && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${product.name}`}
                      checked={selected.includes(product.id)}
                      onChange={(event) =>
                        setSelected((v) =>
                          event.target.checked
                            ? [...v, product.id]
                            : v.filter((id) => id !== product.id)
                        )
                      }
                      className="accent-[#065f46]"
                    />
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex min-w-64 items-center gap-3">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={`${product.name} product image`}
                        width={50}
                        height={50}
                        unoptimized
                        className="h-[50px] w-[50px] rounded-lg bg-[#f1f5ed] object-contain"
                      />
                    ) : (
                      <div className="h-[50px] w-[50px] rounded-lg bg-[#f1f5ed]" />
                    )}
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="font-bold text-[#154b34] hover:underline"
                    >
                      {product.name}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-4 text-xs">
                  <strong>{product.brand_name}</strong>
                  <p className="mt-1 text-[#718278]">{product.category_name}</p>
                </td>
                <td className="px-4 py-4 font-mono text-[11px]">
                  {product.style_code ?? '—'}
                  <p className="mt-1 text-[#718278]">{product.sku ?? '—'}</p>
                </td>
                <td className="px-4 py-4 tabular-nums">{product.variants_count}</td>
                <td className="px-4 py-4 tabular-nums">
                  <strong>{product.live_count}</strong>
                  <p className="mt-1 text-xs text-[#718278]">
                    {product.lowest_price?.toLocaleString() ?? '—'}
                  </p>
                </td>
                <td className="px-4 py-4 text-xs">
                  {product.archived_at ? 'Archived' : product.active ? 'Active record' : 'Draft'}
                </td>
                <td className="px-4 py-4 text-[11px]">
                  {product.featured && <p>Featured</p>}
                  {product.most_wanted && <p>Most Wanted</p>}
                  {!product.featured && !product.most_wanted && '—'}
                </td>
                <td className="px-4 py-4 text-[11px] text-[#718278]">
                  {new Date(product.updated_at).toLocaleDateString('en-GB')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-12 text-center text-sm text-[#61766b]">
            No products match these filters. Create a draft or change your search.
          </p>
        )}
      </div>
    </>
  );
}
