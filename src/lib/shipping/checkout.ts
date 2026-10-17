import 'server-only';

import { convertToMzn, type CurrencyRates } from '@/lib/currency';
import type { CourierParcel, CourierRate } from './schemas';

const standardParcel = {
  length: 35,
  width: 25,
  height: 15,
  weight: 2,
} as const;

function positiveEnvironmentNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function checkoutParcels(itemCount: number): CourierParcel[] {
  const parcel = {
    submitted_length_cm: positiveEnvironmentNumber(
      'INTERNET_EXPRESS_PARCEL_LENGTH_CM',
      standardParcel.length
    ),
    submitted_width_cm: positiveEnvironmentNumber(
      'INTERNET_EXPRESS_PARCEL_WIDTH_CM',
      standardParcel.width
    ),
    submitted_height_cm: positiveEnvironmentNumber(
      'INTERNET_EXPRESS_PARCEL_HEIGHT_CM',
      standardParcel.height
    ),
    submitted_weight_kg: positiveEnvironmentNumber(
      'INTERNET_EXPRESS_PARCEL_WEIGHT_KG',
      standardParcel.weight
    ),
  };
  return Array.from({ length: Math.max(1, Math.min(10, itemCount)) }, () => ({ ...parcel }));
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 86_400_000));
}

export type CheckoutShippingMethod = {
  code: string;
  name: string;
  description: string;
  price: number;
  currency: 'MZN';
  provider_price: number;
  provider_currency: 'ZAR';
  estimated_min_days: number;
  estimated_max_days: number;
  source: 'internet_express';
};

export function checkoutShippingMethods(
  rates: CourierRate[],
  currencyRates: CurrencyRates,
  destinationCountry: string
): CheckoutShippingMethod[] {
  return rates.flatMap((rate) => {
    const isDocumentService = /\b(doc|docs|document|documents)\b/i.test(
      `${rate.code} ${rate.name} ${rate.description}`
    );
    if (destinationCountry !== 'ZA' && isDocumentService) return [];
    const price = convertToMzn(rate.amount, 'ZAR', currencyRates);
    if (price === null) return [];
    const deliveryFrom = daysUntil(rate.deliveryFrom);
    const deliveryTo = daysUntil(rate.deliveryTo);
    return [
      {
        code: `IE_${rate.serviceId}`,
        name: rate.name,
        description: rate.description,
        price,
        currency: 'MZN' as const,
        provider_price: rate.amount,
        provider_currency: 'ZAR' as const,
        estimated_min_days: deliveryFrom ?? deliveryTo ?? 1,
        estimated_max_days: deliveryTo ?? deliveryFrom ?? 7,
        source: 'internet_express' as const,
      },
    ];
  });
}
