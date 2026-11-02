import { z } from 'zod';
import { shippingDestinationSchema, validDestinationRegion } from '@/lib/shipping/destination';
import { shippingCountries } from '@/lib/shipping/countries';
export const savedAddressDetailsSchema = shippingDestinationSchema
  .extend({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,25}$/)
      .refine((value) => {
        const digits = value.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
      }),
    delivery_notes: z.string().trim().max(500).default(''),
  })
  .refine(validDestinationRegion, { message: 'Confirm the province and postal code.' })
  .refine((data) => shippingCountries.some((country) => country.code === data.country), {
    message: 'Choose a supported delivery country.',
  });
export type SavedAddressDetails = z.infer<typeof savedAddressDetailsSchema>;
export type SavedAddress = {
  id: string;
  label: string;
  details: SavedAddressDetails;
  is_default: boolean;
  revision: number;
};
export type CheckoutIdentity =
  | { signedIn: false }
  | {
      signedIn: true;
      userId: string;
      contact: { name: string; email: string; phone: string };
      addresses: SavedAddress[];
    };
export function decodeSavedAddresses(
  rows: { id: string; label: string; details: unknown; is_default: boolean; revision: number }[]
): SavedAddress[] {
  return rows.flatMap((row) => {
    const parsed = savedAddressDetailsSchema.safeParse(row.details);
    return parsed.success
      ? [
          {
            id: row.id,
            label: row.label,
            is_default: row.is_default,
            revision: row.revision,
            details: parsed.data,
          },
        ]
      : [];
  });
}
