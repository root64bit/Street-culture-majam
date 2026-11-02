'use client';
import Link from 'next/link';
import { useState } from 'react';
import { addressLines } from '@/lib/shipping/address';
import type { SavedAddress, CheckoutIdentity } from '@/lib/checkout-addresses';
export function SavedAddresses({ initial }: { initial: SavedAddress[] }) {
  const [addresses, setAddresses] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [confirmDelete, setConfirmDelete] = useState('');
  const operate = async (entry: SavedAddress, operation: 'DEFAULT' | 'DELETE') => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/account/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, id: entry.id, revision: entry.revision }),
      });
      if (!response.ok) throw new Error('Address changed');
      const reload = await fetch('/api/account/checkout', { cache: 'no-store' });
      if (!reload.ok) throw new Error('Reload failed');
      const identity = (await reload.json()) as CheckoutIdentity;
      if (!identity.signedIn) throw new Error('Signed out');
      setAddresses(identity.addresses);
      setConfirmDelete('');
      setMessage(
        operation === 'DELETE'
          ? 'Saved address removed. Existing orders are unchanged.'
          : 'Default address updated for future checkouts.'
      );
    } catch {
      setMessage('This address could not be updated. Refresh the page and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p className="max-w-2xl text-sm leading-6 text-neutral-600">
        These delivery contacts are private to your account. Choose them at checkout or save a new
        address there. Changes never alter an existing order.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {addresses.map((entry) => (
          <section key={entry.id} className="rounded-2xl border border-black/10 bg-white p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold">{entry.label}</h2>
              {entry.is_default && (
                <span className="rounded-full bg-acid px-3 py-1 text-xs font-bold">Default</span>
              )}
            </div>
            <p className="mt-4 text-sm leading-7 text-neutral-700">
              {addressLines(entry.details).map((line, index) => (
                <span key={index} className="block">
                  {line}
                </span>
              ))}
              <span className="block">{entry.details.email}</span>
            </p>
            <div className="mt-5 flex flex-wrap gap-4">
              {!entry.is_default && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void operate(entry, 'DEFAULT')}
                  className="text-sm font-bold underline disabled:opacity-50"
                >
                  Set as default
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(entry.id)}
                className="text-sm font-bold text-red-800 underline disabled:opacity-50"
              >
                Remove saved address
              </button>
            </div>
            {confirmDelete === entry.id && (
              <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-950">
                <p>
                  Remove this saved address from your account? Past orders keep their original
                  delivery information.
                </p>
                <div className="mt-3 flex gap-4">
                  <button
                    type="button"
                    disabled={busy}
                    className="font-bold underline"
                    onClick={() => void operate(entry, 'DELETE')}
                  >
                    Yes, remove it
                  </button>
                  <button type="button" onClick={() => setConfirmDelete('')}>
                    Keep address
                  </button>
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
      {!addresses.length && (
        <p className="mt-6 rounded-2xl bg-white p-6 text-neutral-700">
          No saved addresses yet. Tick “Save this address” during your next checkout.
        </p>
      )}
      {message && (
        <p role="status" className="mt-5 text-sm text-neutral-800">
          {message}
        </p>
      )}
      <Link
        href="/shop"
        className="mt-8 inline-flex rounded-full bg-black px-6 py-3 text-sm font-bold text-white"
      >
        Continue shopping
      </Link>
    </div>
  );
}
