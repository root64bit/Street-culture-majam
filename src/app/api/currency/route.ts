import { NextResponse } from 'next/server';

type RatesResponse = {
  result?: string;
  base_code?: string;
  time_last_update_unix?: number;
  rates?: { EUR?: number; ZAR?: number };
};

export async function GET(request: Request) {
  const country = process.env.VERCEL === '1'
    ? request.headers.get('x-vercel-ip-country')?.toUpperCase() ?? null
    : null;
  const suggestedCurrency = country === 'ZA' ? 'ZAR'
    : country && ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'].includes(country) ? 'EUR'
      : 'MZN';

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/MZN', {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('Rate provider unavailable');
    const data = await response.json() as RatesResponse;
    const eur = data.rates?.EUR;
    const zar = data.rates?.ZAR;
    if (data.result !== 'success' || data.base_code !== 'MZN' ||
      !Number.isFinite(eur) || !Number.isFinite(zar) ||
      !eur || !zar || !data.time_last_update_unix ||
      Date.now() / 1000 - data.time_last_update_unix > 3 * 86_400) {
      throw new Error('Rate data invalid or stale');
    }
    return NextResponse.json({
      suggestedCurrency, rates: { MZN: 1, EUR: eur, ZAR: zar },
      updatedAt: new Date(data.time_last_update_unix * 1000).toISOString(),
      source: 'https://www.exchangerate-api.com',
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({
      suggestedCurrency: 'MZN', rates: { MZN: 1 }, updatedAt: null, source: null,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
}
