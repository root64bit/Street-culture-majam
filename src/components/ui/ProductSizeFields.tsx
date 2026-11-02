'use client';

import { useId, useState } from 'react';
import {
  PRODUCT_SIZE_SYSTEMS,
  productSizeChoices,
  type ProductSizeSystem,
} from '@/lib/product-sizes';

export function ProductSizeFields({
  size,
  system,
  onSizeChange,
  onSystemChange,
  systemName = 'sizeSystem',
  tone = 'light',
}: {
  size: string;
  system: string;
  onSizeChange: (value: string) => void;
  onSystemChange: (value: ProductSizeSystem) => void;
  systemName?: string;
  tone?: 'light' | 'dark';
}) {
  const id = useId();
  const [custom, setCustom] = useState(false);
  const choices = productSizeChoices(system);
  const customEntry = custom || (size !== '' && !choices.includes(size));
  const field = `mt-2 block w-full rounded-xl border px-3 py-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-emerald-600 ${tone === 'light' ? 'border-black/15 bg-white text-neutral-950' : 'border-white/20 bg-vault-900 text-white'}`;
  const label = `block text-xs font-bold ${tone === 'light' ? 'text-neutral-700' : 'text-neutral-300'}`;
  return (
    <>
      <label className={label}>
        Size system
        <select
          name={systemName}
          value={system}
          className={field}
          onChange={(event) => {
            setCustom(false);
            onSystemChange(event.target.value as ProductSizeSystem);
          }}
          aria-describedby={`${id}-help`}
        >
          {!PRODUCT_SIZE_SYSTEMS.includes(system as ProductSizeSystem) && (
            <option value={system}>{system}</option>
          )}
          {PRODUCT_SIZE_SYSTEMS.map((value) => (
            <option key={value} value={value}>
              {value === 'STANDARD' ? 'Apparel / one size' : value}
            </option>
          ))}
        </select>
      </label>
      <div>
        <label className={label}>
          Size
          <select
            value={customEntry ? '__custom__' : size}
            className={field}
            required
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              const selected = event.target.value;
              setCustom(selected === '__custom__');
              onSizeChange(selected === '__custom__' ? '' : selected);
            }}
          >
            <option value="">Choose {system === 'STANDARD' ? 'size' : `${system} size`}</option>
            {choices.map((value) => (
              <option key={value} value={value}>
                {value === 'OS' ? 'One size (OS)' : value}
              </option>
            ))}
            <option value="__custom__">Other / custom size</option>
          </select>
        </label>
        {customEntry && (
          <label className={`${label} mt-2`}>
            Custom size
            <input
              value={size}
              onChange={(event) => onSizeChange(event.target.value)}
              maxLength={24}
              required
              className={field}
              placeholder="Exact label on the item"
            />
          </label>
        )}
        <input type="hidden" name="size" value={size} />
        <p
          id={`${id}-help`}
          className={`mt-2 text-xs font-normal ${tone === 'light' ? 'text-neutral-500' : 'text-neutral-400'}`}
        >
          Use the label on the item. Whole and half sizes are available; changing the system does
          not convert a size.
        </p>
      </div>
    </>
  );
}
