'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProductEditModeButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function prepare() {
    if (
      !window.confirm(
        'Unpublish available listings so you can edit this product? It will be hidden from shoppers until you publish it again. Sold items are unchanged; active customer reservations block this action.'
      )
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/products/${productId}/edit-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: 'Preparing available stock for product corrections in the full editor.',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not open editing mode.');
      setMessage(
        'Ready to edit. Save your changes, then publish available items again in Listings.'
      );
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not open editing mode.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void prepare()}
        disabled={busy}
        className="min-h-11 rounded-full bg-[#0d211a] px-5 py-3 text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Preparing editor…' : 'Unpublish to edit product'}
      </button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
