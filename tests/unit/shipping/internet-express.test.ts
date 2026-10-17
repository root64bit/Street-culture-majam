// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { courierQuoteSchema, parseCourierRates } from '@/lib/shipping/schemas';

vi.mock('server-only', () => ({}));

import {
  getInternetExpressAccount,
  getInternetExpressRates,
} from '@/lib/shipping/internet-express';

const address = {
  type: 'residential' as const,
  street_address: '10 Midas Avenue',
  local_area: 'Olympus AH',
  city: 'Pretoria',
  zone: 'Gauteng',
  country: 'ZA' as const,
  code: '0081',
  company: '',
};
const parcel = {
  submitted_length_cm: 30,
  submitted_width_cm: 20,
  submitted_height_cm: 10,
  submitted_weight_kg: 2,
};
const rate = {
  rate: 142.36,
  rate_excluding_vat: 129.77,
  rate_adjustments: [{ charge: 11.5 }, { charge: 45.85 }],
  service_level: {
    id: 1,
    code: 'ECO',
    name: 'Economy',
    delivery_date_from: '2026-10-21T08:00:00+02:00',
    delivery_date_to: '2026-10-22T17:00:00+02:00',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Internet Express quotes', () => {
  it('uses the provider total without adding VAT and surcharges again', () => {
    const parsed = parseCourierRates({ rates: [rate] });
    expect(parsed[0]).toMatchObject({ amount: 142.36, currency: 'ZAR', code: 'ECO' });
  });

  it('treats a missing or malformed rate as an error, not free delivery', () => {
    expect(() => parseCourierRates({ message: 'Failed' })).toThrow();
    expect(() => parseCourierRates({ rates: [{ ...rate, rate: null }] })).toThrow();
    expect(parseCourierRates({ rates: [] })).toEqual([]);
  });

  it('requires real positive measurements and a complete address', () => {
    const input = { delivery_address: address, parcels: [parcel], declared_value: 1000 };
    expect(courierQuoteSchema.safeParse(input).success).toBe(true);
    expect(
      courierQuoteSchema.safeParse({ ...input, parcels: [{ ...parcel, submitted_weight_kg: 0 }] })
        .success
    ).toBe(false);
    expect(
      courierQuoteSchema.safeParse({ ...input, delivery_address: { ...address, code: '' } }).success
    ).toBe(false);
  });

  it('reads the saved collection address and uses only the accounts and rates endpoints', async () => {
    vi.stubEnv('INTERNET_EXPRESS_API_KEY', 'test-secret');
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accounts: [{ name: 'Street Culture', default_collection_address: { address } }],
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ rates: [rate] })));
    vi.stubGlobal('fetch', request);
    const result = await getInternetExpressRates({
      delivery_address: address,
      parcels: [parcel],
      declared_value: 1000,
    });
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      'https://api.shiplogic.com/accounts',
      'https://api.shiplogic.com/rates',
    ]);
    expect(request.mock.calls[1][1].headers.Authorization).toBe('Bearer test-secret');
    expect(JSON.parse(request.mock.calls[1][1].body).collection_address).toEqual(address);
    expect(JSON.parse(request.mock.calls[1][1].body)).not.toHaveProperty('declared_value');
    expect(JSON.stringify(result)).not.toContain('test-secret');
    expect(result.rates[0].amount).toBe(142.36);
  });

  it('only submits declared value when liability cover is explicitly enabled', async () => {
    vi.stubEnv('INTERNET_EXPRESS_API_KEY', 'test-secret');
    vi.stubEnv('INTERNET_EXPRESS_LIABILITY_COVER_ENABLED', 'true');
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accounts: [{ name: 'Street Culture', default_collection_address: { address } }],
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ rates: [rate] })));
    vi.stubGlobal('fetch', request);
    await getInternetExpressRates({
      delivery_address: address,
      parcels: [parcel],
      declared_value: 1000,
    });
    expect(JSON.parse(request.mock.calls[1][1].body).declared_value).toBe(1000);
  });

  it('returns a safe authentication error without exposing provider contents', async () => {
    vi.stubEnv('INTERNET_EXPRESS_API_KEY', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('test-secret and private data', { status: 401 }))
    );
    await expect(getInternetExpressAccount()).rejects.toThrow(
      'Internet Express rejected this API key or its account permissions.'
    );
  });

  it('does not quote when the account has no valid collection address', async () => {
    vi.stubEnv('INTERNET_EXPRESS_API_KEY', 'test-secret');
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ accounts: [{ name: 'Street Culture' }] })));
    vi.stubGlobal('fetch', request);
    await expect(
      getInternetExpressRates({
        delivery_address: address,
        parcels: [parcel],
        declared_value: 1000,
      })
    ).rejects.toThrow('Set a complete default collection address');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
