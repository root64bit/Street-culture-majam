'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { InventoryCostPrice } from '@/lib/finance/inventory-cost';
import { emptyPrivateCost, PrivateCostFields, privateCostPayload } from './PrivateCostFields';

export function ListingCostEditor({
  listingId,
  cost,
  editable,
}: {
  listingId: string;
  cost: InventoryCostPrice | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(
    cost
      ? {
          amount: String(cost.amount),
          currency: cost.currency,
          rate: String(cost.mzn_per_unit),
          reference: cost.reference,
        }
      : emptyPrivateCost
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/listings/${listingId}/cost`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: cost?.revision ?? 0,
          cost: privateCostPayload(draft),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save private cost.');
      setMessage('Private cost saved. Existing order cost snapshots are unchanged.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save private cost.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left">
      <summary className="cursor-pointer text-xs font-bold">
        Private purchase cost ·{' '}
        {cost ? `${cost.amount.toFixed(2)} ${cost.currency}` : 'Not recorded'}
      </summary>
      {cost && (
        <p className="mt-2 text-xs">
          Historical MZN cost: {cost.amount_mzn.toFixed(2)} · revision {cost.revision}
        </p>
      )}
      {editable ? (
        <form onSubmit={save} className="mt-3 space-y-3">
          <PrivateCostFields value={draft} onChange={setDraft} />
          <button
            disabled={busy}
            className="rounded-full bg-emerald-900 px-4 py-2 text-xs font-bold text-white"
          >
            {busy ? 'Saving…' : 'Save private cost'}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs">
          Reserved or sold costs are frozen for order reporting. Finance can record an evidenced
          order-level COGS correction.
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-xs">
          {message}
        </p>
      )}
    </details>
  );
}
