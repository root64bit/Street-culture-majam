// Payment methods permitted for NEW checkouts. Keep retired provider records
// and their reporting code: removing a gateway must not erase payment history.
// Card gateways remain disconnected until another provider is approved.
const CHECKOUT_PROVIDERS: readonly string[] = Object.freeze(['mpesa']);

export function paymentProviderAllowed(provider: string): boolean {
  return CHECKOUT_PROVIDERS.includes(provider);
}
