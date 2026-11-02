'use client';
import type { InventoryCostInput } from '@/lib/finance/inventory-cost';

export type PrivateCostDraft = {
  amount: string;
  currency: string;
  rate: string;
  reference: string;
};
export const emptyPrivateCost: PrivateCostDraft = {
  amount: '',
  currency: 'MZN',
  rate: '1',
  reference: '',
};
export function privateCostPayload(value: PrivateCostDraft): InventoryCostInput {
  return {
    amount: Number(value.amount),
    currency: value.currency as InventoryCostInput['currency'],
    mzn_per_unit: Number(value.rate),
    reference: value.reference,
  };
}
const field =
  'mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-950';
export function PrivateCostFields({
  value,
  onChange,
}: {
  value: PrivateCostDraft;
  onChange: (value: PrivateCostDraft) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold">
        Purchase cost per physical unit *
        <input
          type="number"
          min="0"
          max="9999999999.99"
          step="0.01"
          required
          value={value.amount}
          onChange={(event) => onChange({ ...value, amount: event.target.value })}
          className={field}
        />
      </label>
      <label className="text-xs font-semibold">
        Purchase currency
        <select
          value={value.currency}
          onChange={(event) =>
            onChange({
              ...value,
              currency: event.target.value,
              rate: event.target.value === 'MZN' ? '1' : '',
            })
          }
          className={field}
        >
          {['MZN', 'GBP', 'ZAR', 'USD', 'EUR'].map((currency) => (
            <option key={currency}>{currency}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold">
        Historical MZN per one currency unit *
        <input
          type="number"
          min="0.000000000001"
          max="1000000"
          step="any"
          required
          readOnly={value.currency === 'MZN'}
          value={value.rate}
          onChange={(event) => onChange({ ...value, rate: event.target.value })}
          className={field}
        />
      </label>
      <label className="text-xs font-semibold">
        Purchase invoice or evidence reference *
        <input
          required
          minLength={3}
          maxLength={160}
          value={value.reference}
          onChange={(event) => onChange({ ...value, reference: event.target.value })}
          className={field}
        />
      </label>
      <p className="text-xs leading-5 text-neutral-600 sm:col-span-2">
        Private finance data, never shown to shoppers. Use the actual purchase cost, not the selling
        price. Zero means a confirmed free item; leave the optional cost unset if unknown. Foreign
        costs require a recorded historical conversion rate.
      </p>
    </div>
  );
}
