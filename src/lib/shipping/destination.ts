import { z } from 'zod';
import { southAfricaProvinces } from './address';
export const shippingDestinationSchema = z.object({
  address_line_1: z.string().trim().min(4).max(160),
  address_line_2: z.string().trim().max(80).optional().default(''),
  local_area: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().min(2).max(16),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  address_type: z.enum(['residential', 'business']).default('residential'),
});

export function validDestinationRegion(destination: {
  country: string;
  province: string;
  postal_code: string;
}) {
  return (
    destination.country !== 'ZA' ||
    (southAfricaProvinces.some((p) => p.toLowerCase() === destination.province.toLowerCase()) &&
      /^\d{4}$/.test(destination.postal_code))
  );
}
