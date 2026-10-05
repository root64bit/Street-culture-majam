import { z } from 'zod';

export const inventoryDraftSchema = z.object({
  size: z.string().trim().min(1).max(24),
  sizeSystem: z.enum(['US', 'UK', 'EU', 'CM', 'STANDARD']),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']),
  askingPrice: z.number().finite().positive().max(9_999_999_999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use at most two decimal places.'),
});
