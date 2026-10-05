'use client';

import { useState, type FormEvent } from 'react';

export type StockDraft = {
  id: string;
  status: string;
  condition: string;
  asking_price: number;
  currency: string;
  authentication_status: string;
  size: string;
  size_system: string;
};

const field = 'w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm outline-none focus:border-[#065f46] focus:ring-2 focus:ring-[#065f46]/10';
const label = 'block text-[10px] font-bold uppercase tracking-widest text-black/60';

export function StockDraftForm({ productId, initialStock }: { productId: string; initialStock: StockDraft[] }) {
  const [stock, setStock] = useState(initialStock);
  const [size, setSize] = useState('');
  const [sizeSystem, setSizeSystem] = useState<'US' | 'UK' | 'EU' | 'CM' | 'STANDARD'>('STANDARD');
  const [condition, setCondition] = useState<'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR'>('NEW');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const askingPrice = Number(price);
      const response = await fetch(`/api/admin/products/${productId}/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size, sizeSystem, condition, askingPrice }),
      });
      const result = await response.json() as { listingId?: string; error?: string };
      if (!response.ok || !result.listingId) throw new Error(result.error ?? 'Could not save inventory draft.');
      setStock((current) => [...current, {
        id: result.listingId!, status: 'DRAFT', condition,
        asking_price: askingPrice, currency: 'MZN', authentication_status: 'PENDING',
        size: size.trim(), size_system: sizeSystem,
      }]);
      setSize('');
      setPrice('');
      setSuccess('Inventory draft saved. It is not published or authenticated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save inventory draft.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-[2rem] border border-black/10 bg-white p-6 sm:p-8">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#065f46]">Inventory preparation</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight">One-of-one own-stock items</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Record the size, condition, and proposed MZN asking price for each physical item. Every entry has quantity one. This does not verify authenticity or publish it to shoppers. Consignment items use the separate consignment workflow.</p>

      {stock.length > 0 && <div className="mt-6 space-y-2">{stock.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f6f5f2] px-4 py-3 text-sm">
          <span className="font-semibold">{item.size} {item.size_system} · {item.condition.replace('_', ' ')}</span>
          <span>{Number(item.asking_price).toLocaleString('en-US')} {item.currency}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">{item.status} · {item.authentication_status}</span>
        </div>
      ))}</div>}

      <form onSubmit={submit} className="mt-7 grid gap-4 sm:grid-cols-2">
        <label className={`space-y-2 ${label}`}>Size *<input className={field} value={size} onChange={(event) => setSize(event.target.value)} maxLength={24} required placeholder="e.g. OS, EU 38, 10.5" /></label>
        <label className={`space-y-2 ${label}`}>Size system *<select className={field} value={sizeSystem} onChange={(event) => setSizeSystem(event.target.value as typeof sizeSystem)}><option value="STANDARD">Standard / one size</option><option value="US">US</option><option value="UK">UK</option><option value="EU">EU</option><option value="CM">CM</option></select></label>
        <label className={`space-y-2 ${label}`}>Condition *<select className={field} value={condition} onChange={(event) => setCondition(event.target.value as typeof condition)}><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option></select></label>
        <label className={`space-y-2 ${label}`}>Asking price (MZN) *<input className={field} type="number" min="0.01" max="9999999999.99" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{error}</p>}
        {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 sm:col-span-2">{success}</p>}
        <button type="submit" disabled={busy} className="w-fit rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#065f46] disabled:opacity-50">{busy ? 'Saving…' : 'Add inventory draft'}</button>
      </form>
    </div>
  );
}
