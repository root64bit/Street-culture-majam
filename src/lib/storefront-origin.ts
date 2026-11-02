export const STOREFRONT_HOST = 'www.streetculturevault.com';
export const STOREFRONT_ORIGIN = `https://${STOREFRONT_HOST}`;
export const APPLE_ASSOCIATION_PATH = '/.well-known/apple-developer-merchantid-domain-association';

export function storefrontRedirect(input: {
  hostname: string;
  pathname: string;
  search: string;
  method: string;
  production: boolean;
}) {
  if (input.pathname === APPLE_ASSOCIATION_PATH) return null;
  const apex = input.hostname === 'streetculturevault.com';
  const productionAlias =
    input.production &&
    input.hostname.endsWith('.vercel.app') &&
    ['GET', 'HEAD'].includes(input.method) &&
    !input.pathname.startsWith('/api/') &&
    input.pathname !== '/api';
  return apex || productionAlias ? `${STOREFRONT_ORIGIN}${input.pathname}${input.search}` : null;
}

export function applePayFailure(cause: unknown, hostname: string, secure: boolean) {
  if (hostname.endsWith('.vercel.app'))
    return {
      code: 'DOMAIN',
      message:
        'Apple Pay must be opened on our verified store. Continue on www.streetculturevault.com, or pay by card here.',
    };
  if (!secure)
    return {
      code: 'SECURE_CONTEXT',
      message:
        'Apple Pay requires a secure connection. Open our verified store in Safari, or choose card payment.',
    };
  const error =
    cause && typeof cause === 'object' ? (cause as { name?: unknown; message?: unknown }) : {};
  const message = typeof error.message === 'string' ? error.message : '';
  if (/domain|merchant.{0,20}(verif|regist)|website.{0,30}verif/i.test(message))
    return {
      code: 'DOMAIN_SETUP',
      message:
        'Apple Pay could not verify this store connection. Please use card payment while we check the wallet setup.',
    };
  if (
    error.name === 'BrowserNotSupportedError' ||
    (error.name === 'PaymentMethodUnsupportedError' &&
      /browser|device|wallet|safari|card/i.test(message))
  )
    return {
      code: 'DEVICE',
      message:
        'Apple Pay is not available in this browser or wallet. Open the main store in Safari on a supported Apple device with a card in Wallet, or pay by card.',
    };
  if (
    [
      'InvalidPaymentRequestError',
      'InvalidConfigurationValueError',
      'PaymentMethodUnsupportedError',
    ].includes(String(error.name))
  )
    return {
      code: 'WALLET_SETUP',
      message:
        'Apple Pay could not be initialized for this checkout. You can safely choose card payment instead.',
    };
  return {
    code: 'LOAD',
    message:
      'Apple Pay could not load. Check your connection and try again, or pay by card instead.',
  };
}
