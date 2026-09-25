import { z } from 'zod';

export const addressSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  streetAddress: z.string().min(5, 'Street address is required'),
  apartment: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State or province is required'),
  postalCode: z.string().min(3, 'Postal code is required'),
  country: z.string().min(2, 'Country is required'),
  phone: z.string().min(6, 'Phone number is required'),
});

export const checkoutSchema = z.object({
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  sameAsShipping: z.boolean().default(true),
});

export const offerSchema = z.object({
  listingId: z.string().uuid(),
  amount: z.number().positive('Offer amount must be greater than zero'),
  currency: z.string().default('USD'),
});

export const profileUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  displayName: z.string().min(2).optional(),
  phone: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  preferredCurrency: z.string().length(3).default('USD'),
});

export type AddressInput = z.infer<typeof addressSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type OfferInput = z.infer<typeof offerSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
