'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Truck } from 'lucide-react';
import type { CourierRate } from '@/lib/shipping/schemas';
import { shippingCountries } from '@/lib/shipping/countries';

const field =
  'mt-1 block w-full rounded-lg border border-[#cfded2] bg-white p-2.5 text-sm font-normal text-[#17251f]';

function deliveryDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'To be confirmed';
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

export function CourierRateForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<{ rates: CourierRate[]; quotedAt: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setQuote(null);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const parcel = {
      submitted_length_cm: Number(form.get('length')),
      submitted_width_cm: Number(form.get('width')),
      submitted_height_cm: Number(form.get('height')),
      submitted_weight_kg: Number(form.get('weight')),
    };
    try {
      const response = await fetch('/api/admin/shipping/internet-express/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_address: {
            type: text('type'),
            street_address: text('street'),
            local_area: text('suburb'),
            city: text('city'),
            zone: text('province'),
            country: text('country'),
            code: text('postcode'),
          },
          parcels: Array.from({ length: Number(form.get('count')) }, () => parcel),
          declared_value: Number(form.get('value')),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not retrieve delivery rates.');
      setQuote(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retrieve delivery rates.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-5 rounded-xl border border-[#dce6dc] bg-[#f7faf5] p-5">
      <summary className="cursor-pointer text-sm font-black text-[#065f46]">
        Compare Internet Express rates
      </summary>
      <p className="mt-3 text-sm leading-6 text-[#61766b]">
        Enter the destination and the packed parcel measurements. This retrieves a quote; booking
        and payment are separate.
      </p>
      <form onSubmit={submit} onChange={() => setQuote(null)} className="mt-5 space-y-5">
        <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" disabled={busy}>
          <legend className="mb-3 text-xs font-black uppercase tracking-wider">Deliver to</legend>
          <label className="text-xs font-bold text-[#536d5e] sm:col-span-2">
            Street address
            <input name="street" required minLength={4} maxLength={200} className={field} />
          </label>
          <label className="text-xs font-bold text-[#536d5e]">
            Suburb / local area
            <input name="suburb" required minLength={2} maxLength={100} className={field} />
          </label>
          <label className="text-xs font-bold text-[#536d5e]">
            City
            <input name="city" required minLength={2} maxLength={100} className={field} />
          </label>
          <label className="text-xs font-bold text-[#536d5e]">
            Province
            <input name="province" required minLength={2} maxLength={100} className={field} />
          </label>
          <label className="text-xs font-bold text-[#536d5e]">
            Postal code
            <input name="postcode" required minLength={3} maxLength={16} className={field} />
          </label>
          <label className="text-xs font-bold text-[#536d5e]">
            Country
            <select name="country" className={field} defaultValue="ZA">
              {shippingCountries.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-[#536d5e]">
            Address type
            <select name="type" className={field} defaultValue="residential">
              <option value="residential">Residential</option>
              <option value="business">Business</option>
            </select>
          </label>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6" disabled={busy}>
          <legend className="mb-3 text-xs font-black uppercase tracking-wider">
            Packed parcel
          </legend>
          {[
            ['length', 'Length (cm)', '300'],
            ['width', 'Width (cm)', '300'],
            ['height', 'Height (cm)', '300'],
            ['weight', 'Weight (kg)', '1000'],
          ].map(([name, label, max]) => (
            <label key={name} className="text-xs font-bold text-[#536d5e]">
              {label}
              <input
                name={name}
                type="number"
                min="0.01"
                max={max}
                step="0.01"
                required
                className={field}
              />
            </label>
          ))}
          <label className="text-xs font-bold text-[#536d5e]">
            Identical parcels
            <input
              name="count"
              type="number"
              min="1"
              max="10"
              step="1"
              defaultValue="1"
              required
              className={field}
            />
          </label>
          <label className="text-xs font-bold text-[#536d5e]">
            Declared value (ZAR, optional)
            <input name="value" type="number" min="0" max="1000000" step="0.01" className={field} />
            <span className="mt-1 block font-normal text-[#738479]">
              Used only after the courier activates liability cover.
            </span>
          </label>
        </fieldset>
        <button
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0d211a] px-5 py-3 text-xs font-bold text-white disabled:opacity-50"
        >
          <Truck className="h-4 w-4" />
          {busy ? 'Getting rates…' : 'Get courier rates'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
      {quote && (
        <div className="mt-5" role="status">
          <p className="mb-3 text-xs text-[#61766b]">
            Quoted{' '}
            {new Date(quote.quotedAt).toLocaleTimeString('en-ZA', {
              timeZone: 'Africa/Johannesburg',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · Courier charges in ZAR. These rates do not change the MZN checkout total.
          </p>
          {quote.rates.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              Internet Express has no available service for this route and parcel. Confirm coverage
              with the courier.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {quote.rates.map((rate) => (
                <article
                  key={rate.serviceId}
                  className="rounded-xl border border-[#dce6dc] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-black">{rate.name}</h3>
                    <strong className="whitespace-nowrap">
                      {new Intl.NumberFormat('en-ZA', {
                        style: 'currency',
                        currency: rate.currency,
                      }).format(rate.amount)}
                    </strong>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#61766b]">{rate.description}</p>
                  <p className="mt-3 text-xs font-semibold">
                    Estimated delivery: {deliveryDate(rate.deliveryFrom)} –{' '}
                    {deliveryDate(rate.deliveryTo)}
                  </p>
                  <p className="mt-1 text-xs text-[#61766b]">
                    Collection from {deliveryDate(rate.collectionDate)} · {rate.code}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </details>
  );
}
