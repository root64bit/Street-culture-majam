import 'server-only';
import { z } from 'zod';
import {
  courierAddressSchema,
  courierQuoteSchema,
  parseCourierRates,
  type CourierAddress,
  type CourierQuoteInput,
} from './schemas';

const apiOrigin = 'https://api.shiplogic.com';

function apiKey() {
  return (
    process.env.INTERNET_EXPRESS_API_KEY?.trim() ||
    process.env.api_internet_express_shipping?.trim() ||
    ''
  );
}

export function internetExpressConfigured() {
  return Boolean(apiKey());
}

export class CourierError extends Error {
  constructor(
    message: string,
    public status = 503
  ) {
    super(message);
    this.name = 'CourierError';
  }
}

async function providerRequest(path: '/accounts' | '/rates', body?: unknown) {
  const key = apiKey();
  if (!key) throw new CourierError('The Internet Express server key has not been configured.');
  try {
    const response = await fetch(`${apiOrigin}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403) {
      throw new CourierError('Internet Express rejected this API key or its account permissions.');
    }
    if (response.status === 429) {
      throw new CourierError(
        'Internet Express is busy. Please wait before requesting another quote.',
        429
      );
    }
    if (response.status === 400 || response.status === 422) {
      throw new CourierError(
        'Internet Express could not quote this route. Check both addresses and the parcel measurements.',
        422
      );
    }
    if (!response.ok) throw new CourierError('Internet Express is temporarily unavailable.');
    return await response.json();
  } catch (error) {
    if (error instanceof CourierError) throw error;
    throw new CourierError('Internet Express did not respond. Please try again shortly.');
  }
}

export type CourierAccount = {
  name: string;
  collectionAddress: CourierAddress | null;
};

export async function getInternetExpressAccount(): Promise<CourierAccount> {
  const response = await providerRequest('/accounts');
  const result = z
    .object({
      accounts: z
        .array(
          z.object({
            name: z.string(),
            default_collection_address: z.object({ address: z.unknown() }).nullish(),
          })
        )
        .length(1),
    })
    .safeParse(response);
  if (!result.success) {
    throw new CourierError(
      'Use an Internet Express API key linked to your single Street Culture account.'
    );
  }
  const account = result.data.accounts[0];
  const address = courierAddressSchema.safeParse(account.default_collection_address?.address);
  return { name: account.name, collectionAddress: address.success ? address.data : null };
}

export async function getInternetExpressRates(input: CourierQuoteInput) {
  const quote = courierQuoteSchema.parse(input);
  const account = await getInternetExpressAccount();
  if (!account.collectionAddress) {
    throw new CourierError(
      'Set a complete default collection address in your Internet Express account first.',
      422
    );
  }
  const response = await providerRequest('/rates', {
    collection_address: account.collectionAddress,
    delivery_address: quote.delivery_address,
    parcels: quote.parcels,
    // Internet Express rejects declared values when liability cover is not
    // enabled on the merchant account. Only include it after the courier has
    // explicitly activated that facility.
    ...(process.env.INTERNET_EXPRESS_LIABILITY_COVER_ENABLED === 'true' && quote.declared_value
      ? { declared_value: quote.declared_value }
      : {}),
  });
  try {
    return {
      accountName: account.name,
      collectionAddress: account.collectionAddress,
      rates: parseCourierRates(response),
      quotedAt: new Date().toISOString(),
    };
  } catch {
    throw new CourierError('Internet Express returned an incomplete quote. Please try again.');
  }
}
