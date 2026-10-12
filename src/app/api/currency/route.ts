import { NextResponse } from 'next/server';
import { fetchMznExchangeRates, suggestDisplayCurrency } from '@/lib/currency';

export async function GET(request: Request) {
  const country =
    (
      request.headers.get('x-vercel-ip-country') ?? request.headers.get('cf-ipcountry')
    )?.toUpperCase() ?? null;
  const suggestedCurrency = suggestDisplayCurrency(country);

  try {
    const snapshot = await fetchMznExchangeRates();
    return NextResponse.json(
      {
        suggestedCurrency,
        ...snapshot,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch {
    return NextResponse.json(
      {
        suggestedCurrency: 'MZN',
        rates: { MZN: 1 },
        updatedAt: null,
        source: null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
