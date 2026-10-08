import { z } from 'zod';

const text = z.string().trim().max(2000);
const name = z.string().trim().min(2).max(160);
const id = z.union([z.string().uuid(), z.literal('')]);
const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
    'Use at most two decimal places.'
  );
const integer = z.coerce.number().int().min(-100000).max(100000);
const asset = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !/(^\/|\.\.|:\/\/)/.test(v), 'Use a relative storage path.');
const catalog = {
  name,
  slug: z
    .string()
    .max(160)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: text,
  imagePath: asset,
  active: z.boolean(),
  sortOrder: integer,
};
export const configurationSchemas = {
  brand: z.object({ ...catalog, featured: z.boolean() }).strict(),
  category: z.object({ ...catalog, parentId: id }).strict(),
  shipping: z
    .object({
      name,
      code: z.string().regex(/^[A-Z0-9_]{2,40}$/),
      countryCode: z.string().regex(/^[A-Z]{2}$/),
      region: text,
      price: money,
      currency: z.literal('MZN'),
      minDays: z.coerce.number().int().min(0).max(365),
      maxDays: z.coerce.number().int().min(0).max(365),
      active: z.boolean(),
    })
    .strict()
    .refine((v) => v.maxDays >= v.minDays, {
      message: 'Maximum delivery days must follow minimum days.',
      path: ['maxDays'],
    }),
  commission: z
    .object({
      name,
      sellerType: z.enum(['STANDARD', 'VERIFIED', 'PROFESSIONAL']),
      brandId: id,
      categoryId: id,
      percentage: z.coerce.number().finite().min(0).max(100),
      fixedFee: money,
      minimumFee: money,
      currency: z.literal('MZN'),
      priority: integer,
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.union([z.string().datetime({ offset: true }), z.literal('')]),
      active: z.boolean(),
    })
    .strict()
    .refine((v) => !v.endsAt || v.endsAt > v.startsAt, {
      message: 'End date must follow start date.',
      path: ['endsAt'],
    }),
  setting: z.discriminatedUnion('key', [
    z
      .object({
        key: z.literal('store'),
        value: z
          .object({
            name,
            supportEmail: z.union([z.string().email().max(200), z.literal('')]),
            supportPhone: z.string().trim().max(30),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        key: z.literal('consignment'),
        value: z.object({ returnInstructions: text.min(10) }).strict(),
      })
      .strict(),
    z
      .object({
        key: z.literal('authentication'),
        value: z
          .object({ checklist: z.array(z.string().trim().min(2).max(200)).min(1).max(20) })
          .strict(),
      })
      .strict(),
    z
      .object({
        key: z.literal('notifications'),
        value: z.object({ lowStockThreshold: z.coerce.number().int().min(0).max(100) }).strict(),
      })
      .strict(),
  ]),
};
export type ConfigurationKind = keyof typeof configurationSchemas;
export const configurationCapabilities: Record<ConfigurationKind, string> = {
  brand: 'brands.manage',
  category: 'categories.manage',
  shipping: 'shipping.manage',
  commission: 'commissions.manage',
  setting: 'settings.manage',
};
export type FormField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'checkbox' | 'datetime-local' | 'email';
  required?: boolean;
  step?: string;
  options?: { value: string; label: string }[];
};
export const commonCatalogFields: FormField[] = [
  { name: 'name', label: 'Name', required: true },
  { name: 'slug', label: 'URL slug', required: true },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'imagePath', label: 'Image storage path (brand-assets)' },
  { name: 'sortOrder', label: 'Sort order', type: 'number', step: '1' },
  { name: 'active', label: 'Active', type: 'checkbox' },
];
