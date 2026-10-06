'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/utils';

type Currency = 'MZN' | 'EUR' | 'ZAR';
type CurrencyState = {
  currency: Currency;
  rates: Partial<Record<Currency, number>>;
  updatedAt: string | null;
  chooseCurrency: (currency: Currency) => void;
};

const CurrencyContext = createContext<CurrencyState | null>(null);
const allowed = new Set<Currency>(['MZN', 'EUR', 'ZAR']);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>('MZN');
  const [rates, setRates] = useState<Partial<Record<Currency, number>>>({ MZN: 1 });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/currency', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { suggestedCurrency?: Currency; rates?: Partial<Record<Currency, number>>; updatedAt?: string } | null) => {
        if (!data) return;
        setRates(data.rates ?? { MZN: 1 });
        setUpdatedAt(data.updatedAt ?? null);
        const saved = window.localStorage.getItem('sc_display_currency');
        const preferred = saved && allowed.has(saved as Currency)
          ? saved as Currency : data.suggestedCurrency ?? 'MZN';
        if (data.rates?.[preferred]) setCurrency(preferred);
      })
      .catch(() => { /* Base MZN pricing remains usable offline. */ });
    return () => controller.abort();
  }, []);

  function chooseCurrency(next: Currency) {
    if (!allowed.has(next)) return;
    setCurrency(next);
    window.localStorage.setItem('sc_display_currency', next);
  }

  return <CurrencyContext.Provider value={{ currency, rates, updatedAt, chooseCurrency }}>{children}</CurrencyContext.Provider>;
}

export function useDisplayCurrency() {
  const state = useContext(CurrencyContext);
  if (!state) throw new Error('CurrencyProvider required');
  return state;
}

export function DisplayPrice({ amount, className }: { amount: number; className?: string }) {
  const { currency, rates } = useDisplayCurrency();
  const rate = rates[currency];
  const displayCurrency = rate ? currency : 'MZN';
  const displayAmount = rate ? amount * rate : amount;
  return <span className={className} title={displayCurrency === 'MZN' ? undefined : `Estimate only. Checkout charges ${formatPrice(amount, 'MZN')}.`}>
    {displayCurrency === 'MZN' ? formatPrice(displayAmount, 'MZN') : `≈ ${formatPrice(displayAmount, displayCurrency)}`}
  </span>;
}
