import { describe, it, expect } from 'vitest';
import { signInSchema, signUpSchema } from '@/lib/schemas/auth.schema';
import { consignmentSubmissionSchema } from '@/lib/schemas/consignment.schema';
import { offerSchema } from '@/lib/schemas/marketplace.schema';

describe('Zod Validation Schemas', () => {
  it('validates sign in credentials correctly', () => {
    const valid = signInSchema.safeParse({
      email: 'collector@streetculture.com',
      password: 'password123',
    });
    expect(valid.success).toBe(true);

    const invalid = signInSchema.safeParse({
      email: 'not-an-email',
      password: '123',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates sign up schema constraints', () => {
    const valid = signUpSchema.safeParse({
      fullName: 'Virgil Abloh',
      email: 'virgil@streetculture.com',
      password: 'strongpassword123',
    });
    expect(valid.success).toBe(true);

    const tooShortPassword = signUpSchema.safeParse({
      fullName: 'Virgil',
      email: 'virgil@streetculture.com',
      password: 'short',
    });
    expect(tooShortPassword.success).toBe(false);
  });

  it('validates consignment intake submission', () => {
    const valid = consignmentSubmissionSchema.safeParse({
      brandName: 'Jordan',
      productName: 'Air Jordan 4 Retro Military Blue',
      size: '10.5',
      sizeSystem: 'US',
      condition: 'NEW / UNWORN',
      expectedPrice: 420.0,
      currency: 'USD',
      deliveryMethod: 'SHIP_TO_VAULT',
    });
    expect(valid.success).toBe(true);

    const invalidPrice = consignmentSubmissionSchema.safeParse({
      brandName: 'Jordan',
      productName: 'Air Jordan 4',
      size: '10.5',
      condition: 'NEW',
      expectedPrice: -50,
    });
    expect(invalidPrice.success).toBe(false);
  });

  it('validates marketplace offer bids', () => {
    const valid = offerSchema.safeParse({
      listingId: 'b0000000-0000-0000-0000-000000000001',
      amount: 1500,
      currency: 'USD',
    });
    expect(valid.success).toBe(true);

    const invalid = offerSchema.safeParse({
      listingId: 'not-a-uuid',
      amount: 0,
      currency: 'USD',
    });
    expect(invalid.success).toBe(false);
  });
});
