'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ReconcilePaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function reconcile() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/payments/${paymentId}/reconcile`, {
        method: 'POST',
        cache: 'no-store',
      });
      const body: { error?: string; status?: string; needsReview?: boolean } =
        await response.json();
      if (!response.ok) setMessage(body.error ?? 'Status check failed.');
      else {
        setMessage(
          body.needsReview
            ? 'Paid, but order needs review.'
            : `Provider: ${body.status ?? 'pending'}`
        );
        router.refresh();
      }
    } catch {
      setMessage('Status check failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-32">
      <button
        type="button"
        disabled={busy}
        onClick={reconcile}
        className="rounded-lg border border-[#cbded0] px-3 py-2 text-[11px] font-bold text-[#126347] hover:bg-[#eef7f1] disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Check provider'}
      </button>
      {message && (
        <p role="status" className="mt-1 max-w-48 text-[11px] text-[#61766b]">
          {message}
        </p>
      )}
    </div>
  );
}
