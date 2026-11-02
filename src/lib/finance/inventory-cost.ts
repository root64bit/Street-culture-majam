import { z } from 'zod';
import { moneyMinor } from '@/lib/money';

export const inventoryCostInputSchema = z
  .object({
    amount: z
      .number()
      .finite()
      .min(0)
      .max(9_999_999_999.99)
      .refine((value) => {
        try {
          moneyMinor(value);
          return true;
        } catch {
          return false;
        }
      }, 'Use at most two decimal places.'),
    currency: z.enum(['MZN', 'GBP', 'ZAR', 'USD', 'EUR']),
    mzn_per_unit: z.number().finite().positive().max(1_000_000),
    reference: z.string().trim().min(3).max(160),
  })
  .refine(
    (cost) => cost.currency !== 'MZN' || cost.mzn_per_unit === 1,
    'MZN conversion must be 1.'
  );
export type InventoryCostInput = z.infer<typeof inventoryCostInputSchema>;
export type InventoryCostPrice = InventoryCostInput & { amount_mzn: number; revision: number };
