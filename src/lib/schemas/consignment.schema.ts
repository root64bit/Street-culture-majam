import { z } from 'zod';

export const consignmentSubmissionSchema = z.object({
  brandName: z.string().min(1, 'Brand name is required'),
  productName: z.string().min(1, 'Product name is required'),
  categoryId: z.string().uuid().optional(),
  size: z.string().min(1, 'Size is required'),
  sizeSystem: z.string().default('US'),
  condition: z.string().min(1, 'Condition is required'),
  expectedPrice: z.number().positive('Expected price must be greater than 0'),
  currency: z.literal('MZN').default('MZN'),
  purchaseYear: z.number().int().min(1970).max(new Date().getFullYear()).optional(),
  deliveryMethod: z.enum(['SHIP_TO_VAULT', 'DROP_OFF']).default('SHIP_TO_VAULT'),
});

export type ConsignmentSubmissionInput = z.infer<typeof consignmentSubmissionSchema>;
