import { z } from 'zod';

export const courierAddressSchema = z.object({
  type: z.enum(['business', 'residential']).default('residential'),
  company: z.string().trim().max(100).optional().default(''),
  street_address: z.string().trim().min(4).max(200),
  local_area: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  zone: z.string().trim().min(2).max(100),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  code: z.string().trim().min(3).max(16),
});

export const courierParcelSchema = z.object({
  submitted_length_cm: z.number().finite().positive().max(300),
  submitted_width_cm: z.number().finite().positive().max(300),
  submitted_height_cm: z.number().finite().positive().max(300),
  submitted_weight_kg: z.number().finite().positive().max(1000),
});

export const courierQuoteSchema = z.object({
  delivery_address: courierAddressSchema,
  parcels: z.array(courierParcelSchema).min(1).max(10),
  declared_value: z.number().finite().min(0).max(1_000_000).optional(),
});

export type CourierAddress = z.infer<typeof courierAddressSchema>;
export type CourierQuoteInput = z.infer<typeof courierQuoteSchema>;
export type CourierParcel = z.infer<typeof courierParcelSchema>;

export type CourierRate = {
  serviceId: number;
  code: string;
  name: string;
  description: string;
  amount: number;
  currency: 'ZAR';
  collectionDate: string | null;
  deliveryFrom: string | null;
  deliveryTo: string | null;
};

const providerRateSchema = z.object({
  rate: z.number().finite().nonnegative(),
  service_level: z.object({
    id: z.number().int().positive(),
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullish(),
    collection_date: z.string().nullish(),
    delivery_date_from: z.string().nullish(),
    delivery_date_to: z.string().nullish(),
  }),
});

export function parseCourierRates(body: unknown): CourierRate[] {
  const parsed = z.object({ rates: z.array(z.unknown()) }).safeParse(body);
  if (!parsed.success) throw new Error('Internet Express returned an invalid rate response.');
  const rates = parsed.data.rates.map((entry) => {
    const result = providerRateSchema.safeParse(entry);
    if (!result.success) throw new Error('Internet Express returned an incomplete rate.');
    const { rate, service_level: service } = result.data;
    return {
      serviceId: service.id,
      code: service.code,
      name: service.name,
      description: service.description ?? '',
      // The provider's total already includes its applicable charges and VAT.
      amount: Math.round((rate + Number.EPSILON) * 100) / 100,
      currency: 'ZAR' as const,
      collectionDate: service.collection_date ?? null,
      deliveryFrom: service.delivery_date_from ?? null,
      deliveryTo: service.delivery_date_to ?? null,
    };
  });
  return rates.sort((a, b) => a.amount - b.amount);
}
