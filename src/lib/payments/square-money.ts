import type { CurrencyRates } from '@/lib/currency';

export const SQUARE_SETTLEMENT_CURRENCY = 'GBP' as const;

export function formatSquareAmount(amount: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: SQUARE_SETTLEMENT_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export type SquareQuote = {
  amountMinor: number;
  amount: number;
  currency: typeof SQUARE_SETTLEMENT_CURRENCY;
  gbpPerMzn: number;
};

export function quoteMznInGbp(totalMzn: number, rates: CurrencyRates): SquareQuote {
  const gbpPerMzn = rates.GBP;
  if (
    !Number.isFinite(totalMzn) ||
    totalMzn <= 0 ||
    !gbpPerMzn ||
    !Number.isFinite(gbpPerMzn) ||
    gbpPerMzn <= 0
  ) {
    throw new Error('A current GBP exchange rate is unavailable.');
  }

  const amountMinor = Math.round(totalMzn * gbpPerMzn * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
    throw new Error('The converted Square payment amount is invalid.');
  }

  return {
    amountMinor,
    amount: amountMinor / 100,
    currency: SQUARE_SETTLEMENT_CURRENCY,
    gbpPerMzn,
  };
}
