'use client';
import { useState } from 'react';
export function CommissionCalculator() {
  const [gross, setGross] = useState(25000);
  const [percent, setPercent] = useState(30);
  const [fixed, setFixed] = useState(0);
  const [minimum, setMinimum] = useState(0);
  const fee = Math.min(
    Math.max(gross, 0),
    Math.max(minimum, Math.round(((gross * percent) / 100 + fixed) * 100) / 100)
  );
  return (
    <details className="mt-4 rounded-2xl border border-[#dce6dc] bg-white p-5">
      <summary className="cursor-pointer text-sm font-bold">Commission calculator</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Sale (MZN)', value: gross, set: setGross },
          { label: 'Percentage', value: percent, set: setPercent },
          { label: 'Fixed fee', value: fixed, set: setFixed },
          { label: 'Minimum fee', value: minimum, set: setMinimum },
        ].map((field) => (
          <label key={field.label} className="text-xs font-bold text-[#61766b]">
            {field.label}
            <input
              type="number"
              min={0}
              max={field.label === 'Percentage' ? 100 : 9999999999}
              step="0.01"
              value={field.value}
              onChange={(event) => field.set(Math.max(0, Number(event.target.value)))}
              className="mt-1 block w-full rounded-lg border border-[#dce6dc] p-2 text-sm"
            />
          </label>
        ))}
      </div>
      <p className="mt-4 text-sm">
        Platform retains <strong>{fee.toLocaleString()} MZN</strong> · Seller receives{' '}
        <strong>{Math.max(0, gross - fee).toLocaleString()} MZN</strong>
      </p>
      <p className="mt-2 text-xs text-[#61766b]">
        Preview only. This does not change a rule or payout.
      </p>
    </details>
  );
}
