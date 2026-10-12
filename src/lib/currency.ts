export const SUPPORTED_CURRENCIES = ['MZN', 'EUR', 'ZAR', 'USD', 'GBP'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export type CurrencyRates = Partial<Record<SupportedCurrency, number>>;

export type MznRateSnapshot = {
  rates: Record<SupportedCurrency, number>;
  updatedAt: string;
  source: string;
};

type RatesResponse = {
  result?: string;
  base_code?: string;
  time_last_update_unix?: number;
  rates?: Partial<Record<SupportedCurrency, number>>;
};

const euroCountries = new Set([
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
]);

const poundCountries = new Set(['GB', 'GG', 'IM', 'JE']);

export function suggestDisplayCurrency(country: string | null): SupportedCurrency {
  if (country === 'ZA') return 'ZAR';
  if (country === 'US') return 'USD';
  if (country && poundCountries.has(country)) return 'GBP';
  if (country && euroCountries.has(country)) return 'EUR';
  return 'MZN';
}

export async function fetchMznExchangeRates(): Promise<MznRateSnapshot> {
  const response = await fetch('https://open.er-api.com/v6/latest/MZN', {
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Rate provider unavailable');

  const data = (await response.json()) as RatesResponse;
  const timestamp = data.time_last_update_unix;
  const rates = Object.fromEntries(
    SUPPORTED_CURRENCIES.map((currency) => [
      currency,
      currency === 'MZN' ? 1 : data.rates?.[currency],
    ])
  ) as Record<SupportedCurrency, number>;

  if (
    data.result !== 'success' ||
    data.base_code !== 'MZN' ||
    !timestamp ||
    Date.now() / 1000 - timestamp > 3 * 86_400 ||
    SUPPORTED_CURRENCIES.some(
      (currency) => !Number.isFinite(rates[currency]) || rates[currency] <= 0
    )
  ) {
    throw new Error('Rate data invalid or stale');
  }

  return {
    rates,
    updatedAt: new Date(timestamp * 1000).toISOString(),
    source: 'https://www.exchangerate-api.com',
  };
}

export function sourceToMznRate(currency: SupportedCurrency, rates: CurrencyRates): number | null {
  if (currency === 'MZN') return 1;
  const quotedRate = rates[currency];
  return quotedRate && Number.isFinite(quotedRate) && quotedRate > 0 ? 1 / quotedRate : null;
}

export function convertToMzn(
  amount: number,
  currency: SupportedCurrency,
  rates: CurrencyRates
): number | null {
  const rate = sourceToMznRate(currency, rates);
  if (!rate || !Number.isFinite(amount)) return null;
  const converted = Math.round((amount * rate + Number.EPSILON) * 100) / 100;
  return converted > 0 && converted <= 9_999_999_999.99 ? converted : null;
}
