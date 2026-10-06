'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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

export function StockDraftForm({ productId, initialStock, productActive }: { productId: string; initialStock: StockDraft[]; productActive: boolean }) {
  const router = useRouter();
  const [stock, setStock] = useState(initialStock);
  const [size, setSize] = useState('');
  const [sizeSystem, setSizeSystem] = useState<'US' | 'UK' | 'EU' | 'CM' | 'STANDARD'>('STANDARD');
  const [condition, setCondition] = useState<'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR'>('NEW');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  async function changePublication(item: StockDraft, publish: boolean) {
    if (!publish && !window.confirm('Unpublish this listing? It will disappear from the storefront.')) return;
    if (publish && (!confirmed[item.id] || (notes[item.id] ?? '').trim().length < 20)) {
      setError('Confirm the physical item, imagery rights, and enter a 20-character authentication note.');
      return;
    }
    setBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch(`/api/admin/listings/${item.id}/publication`, {
        method: publish ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        ...(publish ? { body: JSON.stringify({ decisionNotes: notes[item.id] }) } : {}),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not update listing.');
      setStock((current) => current.map((entry) => entry.id === item.id ? {
        ...entry, status: publish ? 'LIVE' : 'DRAFT',
        authentication_status: publish ? 'PASSED' : entry.authentication_status,
      } : entry));
      setSuccess(publish ? 'Listing is live and visible to shoppers.' : 'Listing unpublished.');
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update listing.'); }
    finally { setBusy(false); }
  }

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

      {stock.length > 0 && <div className="mt-6 space-y-3">{stock.map((item) => (
        <div key={item.id} className="rounded-xl bg-[#f6f5f2] px-4 py-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{item.size} {item.size_system} · {item.condition.replace('_', ' ')}</span>
          <span>{Number(item.asking_price).toLocaleString('en-US')} {item.currency}</span>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800">{item.status} · {item.authentication_status}</span></div>
          {item.status === 'DRAFT' && <div className="mt-4 border-t border-black/10 pt-4">
            <label className={label}>Item-level authentication decision and image-rights note<textarea value={notes[item.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={1000} className={`${field} mt-2 min-h-20`} placeholder="Record inspection, provenance, exact item, price approval and photo rights" /></label>
            <label className="mt-3 flex items-start gap-2 text-xs text-black/60"><input type="checkbox" checked={Boolean(confirmed[item.id])} onChange={(event) => setConfirmed((current) => ({ ...current, [item.id]: event.target.checked }))} />I have inspected this exact item, approved its price, and confirmed the images represent it and may be used.</label>
            <button type="button" onClick={() => void changePublication(item, true)} disabled={busy} className="mt-3 rounded-full bg-[#065f46] px-5 py-2 text-xs font-bold uppercase text-white disabled:opacity-50">Authenticate & publish</button>
          </div>}
          {item.status === 'LIVE' && <button type="button" onClick={() => void changePublication(item, false)} disabled={busy} className="mt-3 rounded-full border border-black/20 px-5 py-2 text-xs font-bold uppercase disabled:opacity-50">Unpublish</button>}
        </div>
      ))}</div>}

      {!productActive && <form onSubmit={submit} className="mt-7 grid gap-4 sm:grid-cols-2">
        <label className={`space-y-2 ${label}`}>Size *<input className={field} value={size} onChange={(event) => setSize(event.target.value)} maxLength={24} required placeholder="e.g. OS, EU 38, 10.5" /></label>
        <label className={`space-y-2 ${label}`}>Size system *<select className={field} value={sizeSystem} onChange={(event) => setSizeSystem(event.target.value as typeof sizeSystem)}><option value="STANDARD">Standard / one size</option><option value="US">US</option><option value="UK">UK</option><option value="EU">EU</option><option value="CM">CM</option></select></label>
        <label className={`space-y-2 ${label}`}>Condition *<select className={field} value={condition} onChange={(event) => setCondition(event.target.value as typeof condition)}><option value="NEW">New</option><option value="LIKE_NEW">Like new</option><option value="GOOD">Good</option><option value="FAIR">Fair</option></select></label>
        <label className={`space-y-2 ${label}`}>Asking price (MZN) *<input className={field} type="number" min="0.01" max="9999999999.99" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
        <button type="submit" disabled={busy} className="w-fit rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#065f46] disabled:opacity-50">{busy ? 'Saving…' : 'Add inventory draft'}</button>
      </form>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
    </div>
  );
}
