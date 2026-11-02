import { describe, expect, it } from 'vitest';
import {
  storefrontRedirect,
  applePayFailure,
  APPLE_ASSOCIATION_PATH,
} from '@/lib/storefront-origin';
import { privateAccessUrl } from '@/lib/access-links';
import { orderEmail, type OrderEmailDesign } from '@/lib/communications/order-template';
import { savedAddressDetailsSchema, decodeSavedAddresses } from '@/lib/checkout-addresses';
describe('verified storefront origin', () => {
  const input = {
    hostname: 'street-culture-majam.vercel.app',
    pathname: '/products/test',
    search: '?size=OS',
    method: 'GET',
    production: true,
  };
  it('redirects production shopping aliases to the registered storefront', () =>
    expect(storefrontRedirect(input)).toBe(
      'https://www.streetculturevault.com/products/test?size=OS'
    ));
  it('does not redirect preview deployments or local development', () => {
    expect(storefrontRedirect({ ...input, production: false })).toBeNull();
    expect(storefrontRedirect({ ...input, hostname: 'localhost' })).toBeNull();
  });
  it('does not redirect API callbacks, payment requests or verification files', () => {
    expect(storefrontRedirect({ ...input, pathname: '/api/payments/square' })).toBeNull();
    expect(storefrontRedirect({ ...input, method: 'POST' })).toBeNull();
    expect(storefrontRedirect({ ...input, pathname: APPLE_ASSOCIATION_PATH })).toBeNull();
  });
  it('keeps apex verification redirect-free but canonicalizes apex pages', () => {
    expect(
      storefrontRedirect({
        ...input,
        hostname: 'streetculturevault.com',
        pathname: APPLE_ASSOCIATION_PATH,
      })
    ).toBeNull();
    expect(storefrontRedirect({ ...input, hostname: 'streetculturevault.com' })).toContain(
      'https://www.streetculturevault.com/'
    );
  });
  it('does not blame the device for a domain registration problem', () => {
    expect(
      applePayFailure(
        { name: 'PaymentMethodUnsupportedError', message: 'Your website domain is not verified' },
        'www.streetculturevault.com',
        true
      ).code
    ).toBe('DOMAIN_SETUP');
    expect(
      applePayFailure(new Error('Any reason'), 'street-culture-majam.vercel.app', true).code
    ).toBe('DOMAIN');
  });
  it('distinguishes network, configuration and actual device failures', () => {
    expect(applePayFailure(new Error('offline'), 'www.streetculturevault.com', true).code).toBe(
      'LOAD'
    );
    expect(
      applePayFailure({ name: 'BrowserNotSupportedError' }, 'www.streetculturevault.com', true).code
    ).toBe('DEVICE');
    expect(
      applePayFailure({ name: 'InvalidPaymentRequestError' }, 'www.streetculturevault.com', true)
        .code
    ).toBe('WALLET_SETUP');
  });
});
describe('private account links', () => {
  it('keeps the requested order destination without exposing owner identity', () =>
    expect(privateAccessUrl('/admin/orders/test', 'staff')).toBe(
      '/auth/access?area=staff&redirectTo=%2Fadmin%2Forders%2Ftest'
    ));
  it('rejects external destinations and access-screen redirect loops', () => {
    expect(privateAccessUrl('//attacker.invalid', 'order')).toContain('redirectTo=%2Faccount');
    expect(privateAccessUrl('/auth/access?area=staff', 'staff')).toContain('redirectTo=%2Faccount');
  });
});
const details = {
  name: 'Synthetic Buyer',
  email: 'buyer@example.invalid',
  phone: '+27110000000',
  country: 'ZA',
  address_line_1: 'Example 1',
  address_line_2: 'Unit 2',
  local_area: 'Mayfair',
  city: 'Johannesburg',
  province: 'Gauteng',
  postal_code: '2092',
  address_type: 'residential',
  delivery_notes: '',
};
describe('saved delivery data', () => {
  it('validates complete addresses and strips untrusted authority fields', () => {
    const result = savedAddressDetailsSchema.parse({ ...details, user_id: 'another-user' });
    expect(result).not.toHaveProperty('user_id');
  });
  it('rejects city values supplied as a province and invalid postal codes', () => {
    expect(
      savedAddressDetailsSchema.safeParse({ ...details, province: 'Johannesburg' }).success
    ).toBe(false);
    expect(
      savedAddressDetailsSchema.safeParse({ ...details, postal_code: 'invalid' }).success
    ).toBe(false);
  });
  it('does not decode incomplete or unsupported-country saved records', () =>
    expect(
      decodeSavedAddresses([
        {
          id: 'x',
          label: 'Home',
          is_default: false,
          revision: 1,
          details: { ...details, country: 'XX' },
        },
      ])
    ).toEqual([]));
});
describe('neon order email design', () => {
  const input: OrderEmailDesign = {
    audience: 'customer',
    kind: 'ORDER_CONFIRMED',
    orderNumber: 'SC00000000',
    orderUrl: 'https://www.streetculturevault.com/order/SC00000000',
    items: [
      { name: 'Example <script>piece</script>', size: 'One size', quantity: 1, price: 'MZN 78.00' },
    ],
    subtotal: 'MZN 78.00',
    delivery: 'MZN 549.85',
    total: 'MZN 627.85',
    payments: ['£7.40 (Square)'],
    service: 'Economy',
    address: [
      'Synthetic Buyer',
      'Unit 2\nExample 1',
      'Johannesburg, Gauteng, 2092',
      'South Africa',
    ],
  };
  it('uses structured tables, explicit line breaks and high-contrast neon accents', () => {
    const email = orderEmail(input);
    expect(email.html).toContain('#c8ff00');
    expect(email.html).toContain('DELIVERY DETAILS');
    expect(email.html).toContain('Unit 2<br>Example 1');
    expect(email.html).toContain('MZN 627.85');
    expect(email.html).toContain('£7.40');
    expect(email.html).toContain('color:#111b15!important');
    expect(email.html).not.toContain('white-space:pre-line');
  });
  it('escapes item and address markup without escaping away layout', () => {
    const email = orderEmail(input);
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('<table');
  });
  it('gives admin and customer distinct calls to action and truthful next steps', () => {
    const customer = orderEmail(input),
      admin = orderEmail({
        ...input,
        audience: 'admin',
        kind: 'ADMIN_NEW_ORDER',
        orderUrl: 'https://www.streetculturevault.com/admin/orders/example',
      });
    expect(customer.text).toContain('View your order');
    expect(customer.text).toContain('does not mean it has shipped');
    expect(admin.text).toContain('Review paid order');
    expect(admin.text).toContain('authorized staff account');
    expect(admin.text).toContain('does not book a courier');
  });
});
