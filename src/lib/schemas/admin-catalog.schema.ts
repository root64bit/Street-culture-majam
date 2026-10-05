import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().default('');

export const productDraftSchema = z.object({
  name: z.string().trim().min(3).max(160),
  brandId: z.string().uuid(),
  categoryId: z.string().uuid(),
  description: optionalText(3000),
  model: optionalText(120),
  sku: optionalText(100),
  colorway: optionalText(120),
  releaseYear: z.number().int().min(1900).max(new Date().getFullYear() + 1).nullable(),
  gender: z.enum(['MEN', 'WOMEN', 'UNISEX', 'KIDS']).nullable(),
});

export const taxonomySchema = z.object({
  kind: z.enum(['brand', 'category']),
  name: z.string().trim().min(2).max(100),
});

export function slugify(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}
