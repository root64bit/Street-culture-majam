// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { checkoutParcels, checkoutShippingMethods } from '@/lib/shipping/checkout';
import type { CourierRate } from '@/lib/shipping/schemas';

const parcelRate: CourierRate = {
  serviceId: 12,
  code: 'INT-ZONE (PARCELS)',
  name: 'International Zone Parcel',
  description: 'International parcel service',
  amount: 2392.66,
  currency: 'ZAR',
  collectionDate: null,
  deliveryFrom: null,
  deliveryTo: null,
};

const documentRate: CourierRate = {
  ...parcelRate,
  serviceId: 11,
  code: 'INT-ZONE (DOCS)',
  name: 'International Zone Documents',
  description: 'Documents only',
};

afterEach(() => vi.unstubAllEnvs());

describe('checkout courier pricing', () => {
  it('uses one configurable packed parcel for every physical item', () => {
    vi.stubEnv('INTERNET_EXPRESS_PARCEL_LENGTH_CM', '40');
    vi.stubEnv('INTERNET_EXPRESS_PARCEL_WEIGHT_KG', '2.5');
    expect(checkoutParcels(2)).toEqual([
      {
        submitted_length_cm: 40,
        submitted_width_cm: 25,
        submitted_height_cm: 15,
        submitted_weight_kg: 2.5,
      },
      {
        submitted_length_cm: 40,
        submitted_width_cm: 25,
        submitted_height_cm: 15,
        submitted_weight_kg: 2.5,
      },
    ]);
  });

  it('keeps physical parcel services and converts the live ZAR total to MZN', () => {
    const methods = checkoutShippingMethods(
      [documentRate, parcelRate],
      { MZN: 1, ZAR: 0.27 },
      'MZ'
    );
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({
      code: 'IE_12',
      source: 'internet_express',
      provider_price: 2392.66,
      provider_currency: 'ZAR',
      price: 8861.7,
      currency: 'MZN',
    });
  });

  it('does not produce a checkout price when exchange rates are unavailable', () => {
    expect(checkoutShippingMethods([parcelRate], { MZN: 1 }, 'PT')).toEqual([]);
  });
});
