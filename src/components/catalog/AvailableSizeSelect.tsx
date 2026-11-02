'use client';
import { useId } from 'react';
import type { StoreListingOption } from '@/data/storefront';
import { formatProductSize } from '@/lib/product-sizes';
import { formatPrice } from '@/lib/utils';

export function AvailableSizeSelect({ options, value, onChange }: {
  options: StoreListingOption[]; value: string; onChange: (id: string) => void;
}) {
  const id = useId();
  const groups = new Map<string, { option: StoreListingOption; count: number }>();
  for (const option of options) {
    const key = JSON.stringify([option.sizeSystem, option.size, option.condition, option.price]);
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { option, count: 1 });
  }
  return <div className="mt-6">
    <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider">Available size</label>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}
      disabled={!options.length} className="mt-3 min-h-14 w-full rounded-2xl border border-black/30 bg-white px-4 py-3 text-base text-black focus:border-black focus:outline-none focus:ring-2 focus:ring-[#c6ff00] disabled:opacity-60"
      aria-describedby={`${id}-help`}>
      <option value="">{options.length ? 'Choose your size' : 'Sizes awaiting confirmation'}</option>
      {[...groups.values()].map(({ option, count }) => <option key={option.listingId} value={option.listingId}>
        {formatProductSize(option.size, option.sizeSystem)} · {option.condition.replaceAll('_', ' ')} · {formatPrice(option.price, 'MZN')} · {count} available
      </option>)}
    </select>
    <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-black/60">
      {options.length ? 'Only currently available, individually sized pieces are shown.' :
        'No confirmed size is available to buy yet. Please contact support to confirm your shoe size.'}
    </p>
  </div>;
}
