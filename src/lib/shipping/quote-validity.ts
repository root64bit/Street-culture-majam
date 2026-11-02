/** Missing/invalid expiry must never be interpreted as a valid or free quote. */
export function shippingQuoteIsCurrent(
  quote: { quoteId: string; expiresAt: string } | undefined,
  now = Date.now()
) {
  return Boolean(
    quote?.quoteId &&
    Number.isFinite(Date.parse(quote.expiresAt)) &&
    Date.parse(quote.expiresAt) > now
  );
}
