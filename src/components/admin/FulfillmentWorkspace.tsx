'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Database } from '@/types/database.types';
import { shippingCountries } from '@/lib/shipping/countries';
import { southAfricaProvinces, addressProblems } from '@/lib/shipping/address';
import { shipmentLabels } from '@/lib/shipping/tracking';

type Job = Database['public']['Tables']['fulfillment_jobs']['Row'];
const fieldClass =
  'mt-1 block w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-950';
function AddressFields({ prefix, initial }: { prefix: string; initial: Record<string, unknown> }) {
  const [country, setCountry] = useState(String(initial.country ?? 'ZA'));
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-3 font-semibold">
        {prefix === 'delivery'
          ? 'Delivery recipient and address'
          : 'Physical collection address and contact'}
      </legend>
      {[
        'name',
        'email',
        'phone',
        'address_line_1',
        'address_line_2',
        'local_area',
        'city',
        'postal_code',
      ].map((key) => (
        <label className="text-xs capitalize" key={key}>
          {key.replaceAll('_', ' ')}
          <input
            name={`${prefix}_${key}`}
            type={key === 'email' ? 'email' : 'text'}
            defaultValue={String(initial[key] ?? '')}
            required={!['email', 'address_line_2'].includes(key)}
            className={fieldClass}
          />
        </label>
      ))}
      <label className="text-xs">
        Country
        <select
          name={`${prefix}_country`}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className={fieldClass}
        >
          {shippingCountries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Province / state
        {country === 'ZA' ? (
          <select
            name={`${prefix}_province`}
            required
            defaultValue={String(initial.province ?? '')}
            className={fieldClass}
          >
            <option value="">Choose province</option>
            {southAfricaProvinces.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        ) : (
          <input
            name={`${prefix}_province`}
            required
            defaultValue={String(initial.province ?? '')}
            className={fieldClass}
          />
        )}
      </label>
      <label className="text-xs">
        Address type
        <select
          name={`${prefix}_address_type`}
          defaultValue={String(initial.address_type ?? 'residential')}
          className={fieldClass}
        >
          <option value="residential">Residential</option>
          <option value="business">Business</option>
        </select>
      </label>
      <label className="text-xs sm:col-span-2">
        Delivery or collection instructions
        <textarea
          name={`${prefix}_delivery_notes`}
          defaultValue={String(initial.delivery_notes ?? '')}
          maxLength={500}
          className={fieldClass}
        />
      </label>
    </fieldset>
  );
}
export function FulfillmentWorkspace({
  orderId,
  address,
  origin,
  job,
  canPrepare,
  canBook,
  packed,
}: {
  orderId: string;
  address: Record<string, unknown>;
  origin: Record<string, unknown>;
  job: Job | null;
  canPrepare: boolean;
  canBook: boolean;
  packed: boolean;
}) {
  const router = useRouter();
  const savedParcels: Record<string, unknown>[] = Array.isArray(job?.parcels)
    ? job.parcels.flatMap((parcel) =>
        parcel && typeof parcel === 'object' && !Array.isArray(parcel)
          ? [parcel as Record<string, unknown>]
          : []
      )
    : [];
  const [note, setNote] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [parcelCount, setParcelCount] = useState(Math.max(1, savedParcels.length));
  const operate = async (operation: string, payload: Record<string, unknown> = {}) => {
    if (busy) return;
    if (note.trim().length < 10) {
      setMessage('Add an evidence note of at least 10 characters.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, revision: job?.revision, note, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage('Recorded. No API courier booking or collection request was sent.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Fulfillment operation failed.');
    } finally {
      setBusy(false);
    }
  };
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const extract = (prefix: string) =>
      Object.fromEntries(
        [
          'name',
          'email',
          'phone',
          'address_line_1',
          'address_line_2',
          'local_area',
          'city',
          'province',
          'postal_code',
          'country',
          'address_type',
          'delivery_notes',
        ].map((key) => [key, String(form.get(`${prefix}_${key}`) ?? '')])
      );
    const parcels = Array.from({ length: parcelCount }, (_, index) =>
      Object.fromEntries(
        ['length_cm', 'width_cm', 'height_cm', 'weight_kg'].map((key) => [
          `submitted_${key}`,
          Number(form.get(`parcel_${index}_${key}`)),
        ])
      )
    );
    void operate('SAVE', {
      address: extract('delivery'),
      origin: extract('origin'),
      parcels,
      address_confirmed: form.get('address_confirmed') === 'on',
      origin_confirmed: form.get('origin_confirmed') === 'on',
      packed_confirmed: form.get('packed_confirmed') === 'on',
    });
  };
  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-black">Shipment and fulfillment</h2>
      <p className="text-sm font-semibold">
        {job ? shipmentLabels[job.state] : 'No fulfillment draft recorded'}
      </p>
      <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950">
        API booking, collection scheduling and automatic tracking are not enabled. The
        account-specific provider contract must be verified first. You can prepare a reviewed draft
        and record a booking made separately in the courier portal. A label does not mean shipped.
      </p>
      {addressProblems(address).map((problem) => (
        <p key={problem} className="text-sm text-red-800">
          {problem}
        </p>
      ))}
      {job?.provider_reference && (
        <div className="text-sm">
          <p>
            Waybill: <strong>{job.provider_reference}</strong>
          </p>
          <p>Label/document evidence: {job.document_reference}</p>
          <p>
            Recorded courier charge: {job.courier_cost} {job.courier_currency}. Included in the
            finance cost ledger.
          </p>
        </div>
      )}
      {message && (
        <p role="status" className="rounded-lg bg-neutral-100 p-3 text-sm">
          {message}
        </p>
      )}
      {canPrepare && (
        <>
          <label className="block text-xs font-semibold">
            Private evidence / action note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={10}
              maxLength={1000}
              className={fieldClass}
            />
          </label>
          {!job && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void operate('PREPARE', { ship_approved: true });
              }}
            >
              <label className="block text-sm">
                <input required type="checkbox" /> This paid order should physically ship, including
                if it was originally a test.
              </label>
              <button
                disabled={busy}
                className="mt-3 rounded-full bg-black px-5 py-3 text-sm font-bold text-white"
              >
                Prepare fulfillment draft
              </button>
            </form>
          )}
          {job &&
            ['REVIEW', 'READY', 'EXCEPTION'].includes(job.state) &&
            !job.provider_reference && (
              <form onSubmit={save} className="space-y-5">
                <AddressFields prefix="delivery" initial={address} />
                <AddressFields prefix="origin" initial={origin} />
                <fieldset className="space-y-3">
                  <legend className="font-semibold">Actual packed parcels</legend>
                  <p className="text-xs text-neutral-600">
                    Do not copy the standard quote measurements without weighing and measuring the
                    packed goods.
                  </p>
                  {Array.from({ length: parcelCount }, (_, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-2 gap-3 rounded-lg bg-neutral-50 p-3 sm:grid-cols-4"
                    >
                      {['length_cm', 'width_cm', 'height_cm', 'weight_kg'].map((key) => (
                        <label className="text-xs" key={key}>
                          Parcel {index + 1} {key.replaceAll('_', ' ')}
                          <input
                            name={`parcel_${index}_${key}`}
                            type="number"
                            min="0.01"
                            max={key === 'weight_kg' ? 1000 : 300}
                            step="0.01"
                            required
                            defaultValue={String(savedParcels[index]?.[`submitted_${key}`] ?? '')}
                            className={fieldClass}
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={parcelCount >= 10}
                    className="text-sm underline"
                    onClick={() => setParcelCount((n) => n + 1)}
                  >
                    Add parcel
                  </button>
                  {parcelCount > 1 && (
                    <button
                      type="button"
                      className="ml-3 text-sm underline"
                      onClick={() => setParcelCount((n) => n - 1)}
                    >
                      Remove last parcel
                    </button>
                  )}
                </fieldset>
                {[
                  ['address_confirmed', 'Customer confirmed this delivery address.'],
                  [
                    'origin_confirmed',
                    'Goods are at this collection address and its contact is correct.',
                  ],
                  [
                    'packed_confirmed',
                    'Goods are checked and packed; measurements above are actual.',
                  ],
                ].map(([name, label]) => (
                  <label className="block text-sm" key={name}>
                    <input type="checkbox" name={name} required /> {label}
                  </label>
                ))}
                {!packed && (
                  <p className="text-sm text-amber-900">
                    Use Start processing and Mark packed above before saving a ready shipment.
                  </p>
                )}
                <button
                  disabled={busy || !packed}
                  className="rounded-full bg-black px-5 py-3 text-sm font-bold text-white"
                >
                  Save reviewed shipment
                </button>
              </form>
            )}
          {canBook && job?.state === 'READY' && (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                void operate('APPROVE', {
                  max_cost_mzn: Number(new FormData(event.currentTarget).get('max_cost_mzn')),
                });
              }}
            >
              <label className="block text-xs">
                Maximum approved courier cost in MZN (not an extra buyer charge)
                <input
                  name="max_cost_mzn"
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  className={fieldClass}
                />
              </label>
              <button
                disabled={busy}
                className="rounded-full border border-black px-5 py-3 text-sm font-bold"
              >
                Approve prepared shipment and cost limit
              </button>
            </form>
          )}
          {canBook && job?.state === 'READY' && job.approved_at && (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void operate('IMPORT_BOOKING', {
                  provider_reference: form.get('provider_reference'),
                  document_reference: form.get('document_reference'),
                  tracking_url: form.get('tracking_url'),
                  courier_cost: Number(form.get('courier_cost')),
                  courier_currency: form.get('courier_currency'),
                  courier_mzn_per_unit: Number(form.get('courier_mzn_per_unit')),
                  cost_confirmed: form.get('cost_confirmed') === 'on',
                });
              }}
            >
              <h3 className="font-semibold">Record an existing courier booking</h3>
              <p className="text-xs text-neutral-600">
                Book in the Internet Express portal first. This form only records the evidence and
                cost; it cannot create a duplicate provider booking.
              </p>
              {[
                ['provider_reference', 'Courier waybill/reference'],
                ['document_reference', 'Label / invoice evidence reference'],
                ['tracking_url', 'HTTPS tracking URL (optional)'],
              ].map(([name, label]) => (
                <label className="block text-xs" key={name}>
                  {label}
                  <input name={name} required={name !== 'tracking_url'} className={fieldClass} />
                </label>
              ))}
              <label className="block text-xs">
                Actual courier charge
                <input
                  name="courier_cost"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className={fieldClass}
                />
              </label>
              <label className="block text-xs">
                Courier currency
                <select name="courier_currency" className={fieldClass}>
                  {['ZAR', 'MZN', 'GBP', 'USD', 'EUR'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                MZN per currency unit at booking
                <input
                  name="courier_mzn_per_unit"
                  type="number"
                  step="any"
                  min="0.000000000001"
                  required
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm">
                <input name="cost_confirmed" type="checkbox" required /> This is the actual booked
                charge, not the checkout estimate. I have checked that it is not already recorded in
                Finance.
              </label>
              <button
                disabled={busy}
                className="rounded-full bg-black px-5 py-3 text-sm font-bold text-white"
              >
                Record booking and courier cost
              </button>
            </form>
          )}
          {job?.provider_reference && (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void operate(String(form.get('operation')), {
                  evidence_reference: form.get('evidence_reference'),
                });
              }}
            >
              <h3 className="font-semibold">Record physical delivery evidence</h3>
              <label className="block text-xs">
                Event
                <select name="operation" className={fieldClass}>
                  {['BOOKED', 'AWAITING_COLLECTION'].includes(job.state) && (
                    <option value="COLLECTED">Courier collected the parcel</option>
                  )}
                  {['COLLECTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(job.state) && (
                    <option value="DELIVERED">Delivery confirmed with evidence</option>
                  )}
                  <option value="EXCEPTION">Exception needs staff attention</option>
                </select>
              </label>
              <label className="block text-xs">
                Handover scan / proof-of-delivery reference
                <input
                  name="evidence_reference"
                  required
                  minLength={3}
                  maxLength={160}
                  className={fieldClass}
                />
              </label>
              <button
                disabled={busy}
                className="rounded-full border border-black px-5 py-3 text-sm font-bold"
              >
                Record evidence and update order
              </button>
            </form>
          )}
          {canBook && job?.provider_reference && job.state === 'EXCEPTION' && (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void operate('RESOLVE_EXCEPTION', {
                  resume_state: packed ? 'BOOKED' : 'COLLECTED',
                  max_cost_mzn: Number(form.get('max_cost_mzn')),
                  evidence_reference: form.get('evidence_reference'),
                });
              }}
            >
              <h3 className="font-semibold">Resolve verified shipment exception</h3>
              <p className="text-xs text-neutral-600">
                This restores the already booked shipment, never creates another booking, and cannot
                bypass payment holds.
              </p>
              <label className="block text-xs">
                Resolution evidence
                <input name="evidence_reference" minLength={3} required className={fieldClass} />
              </label>
              <label className="block text-xs">
                Approved actual cost ceiling in MZN
                <input
                  name="max_cost_mzn"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={fieldClass}
                />
              </label>
              <button
                disabled={busy}
                className="rounded-full border border-black px-5 py-3 text-sm font-bold"
              >
                Approve resolution without rebooking
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
