import { describe, expect, it } from 'vitest';
import { shippingQuoteIsCurrent } from '@/lib/shipping/quote-validity';

describe('delivery quote expiry', () => {
  it('requires a quote ID and a finite future expiry', () => {
    const now = Date.now();
    expect(shippingQuoteIsCurrent(undefined, now)).toBe(false);
    expect(
      shippingQuoteIsCurrent({ quoteId: '', expiresAt: new Date(now + 1000).toISOString() }, now)
    ).toBe(false);
    expect(shippingQuoteIsCurrent({ quoteId: 'id', expiresAt: 'invalid' }, now)).toBe(false);
    expect(
      shippingQuoteIsCurrent({ quoteId: 'id', expiresAt: new Date(now).toISOString() }, now)
    ).toBe(false);
    expect(
      shippingQuoteIsCurrent({ quoteId: 'id', expiresAt: new Date(now + 1000).toISOString() }, now)
    ).toBe(true);
  });
});
