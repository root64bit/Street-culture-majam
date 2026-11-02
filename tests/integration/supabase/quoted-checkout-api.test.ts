// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/types/database.types';
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
import { POST as shipping } from '@/app/api/checkout/shipping/route';
import { POST as checkout } from '@/app/api/checkout/orders/route';
import { maputoDeliveryZones } from '@/lib/shipping/maputo-delivery';
vi.mock('@/lib/shipping/portador-diario', async (original) => ({
  ...(await original<typeof import('@/lib/shipping/portador-diario')>()),
  getPortadorDiarioQuote: async () => ({
    code: 'PD_NORMAL_2',
    name: 'Portador Diário — BEIRA',
    price: 950.01,
    weightKg: 2,
    from: { id: 1, name: 'MAPUTO' },
    to: { id: 2, name: 'BEIRA' },
    quotedAt: new Date().toISOString(),
    service: 'NORMAL',
  }),
}));

const configured = Boolean(process.env.LOCAL_SUPABASE_TEST_URL);
describe.runIf(configured)('quote-to-order API contract with real isolated PostgreSQL', () => {
  afterEach(() => {
    jar.clear();
    vi.unstubAllEnvs();
  });
  async function fixture() {
    const db = createClient<Database>(
      process.env.LOCAL_SUPABASE_TEST_URL!,
      process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const methods = await db.from('shipping_methods').upsert(
      maputoDeliveryZones.map((z) => ({
        code: z.code,
        name: z.name,
        country_code: 'MZ',
        region: null,
        price: z.initialPrice,
        currency: 'MZN',
        estimated_min_days: 0,
        estimated_max_days: 0,
        active: true,
      })),
      { onConflict: 'code' }
    );
    if (methods.error) throw methods.error;
    const id = randomUUID();
    const row = await db.from('listings').insert({
      id,
      product_id: 'd0000000-0000-0000-0000-000000000001',
      variant_id: 'f0000000-0000-0000-0000-000000000001',
      ownership_type: 'STREET_CULTURE',
      condition: 'NEW',
      asking_price: 78.5,
      currency: 'MZN',
      quantity: 1,
      status: 'LIVE',
      authentication_status: 'PASSED',
      published_at: new Date().toISOString(),
    });
    if (row.error) throw row.error;
    return {
      address_line_1: 'Fixture Road 1',
      address_line_2: '',
      local_area: 'Central',
      postal_code: '1100',
      city: 'Maputo',
      province: 'Maputo',
      country: 'MZ',
      address_type: 'residential',
      items: [{ listingId: id, size: '10.5', quantity: 1, displayedPrice: 78.5 }],
    };
  }
  function req(body: object, identity: string) {
    return new Request('http://127.0.0.1:3031/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': identity },
      body: JSON.stringify(body),
    });
  }
  it('returns an opaque HttpOnly-bound quote and the exact same order on an identical retry', async () => {
    const body = await fixture(),
      identity = randomUUID();
    const quote = await shipping(req(body, identity));
    expect(quote.status).toBe(200);
    const cookie = quote.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    jar.set('sc_checkout_session', /sc_checkout_session=([^;]+)/.exec(cookie)![1]);
    const method = (await quote.json()).methods.find(
      (value: { code: string }) => value.code === 'SC_MZ_MAPUTO_CITY'
    );
    expect(method).toMatchObject({
      price: 100,
      source: 'configured',
      quoteId: expect.any(String),
      expiresAt: expect.any(String),
    });
    // Only the order endpoint is invoked; no gateway adapter is enabled or called.
    // The independent SC_EXTERNAL_SERVICES fence and network allowlist remain on.
    vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'true');
    const payload = {
      ...body,
      name: 'Synthetic Buyer',
      email: 'synthetic@example.invalid',
      phone: '+258841234567',
      checkout_id: randomUUID(),
      checkout_secret: randomUUID(),
      shipping_method_code: method.code,
      shipping_quote_id: method.quoteId,
    };
    const first = await checkout(req(payload, identity)),
      second = await checkout(req(payload, identity));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toMatchObject({
      orderId: payload.checkout_id,
      subtotal: 78.5,
      shipping: 100,
      total: 178.5,
    });
    expect(await second.json()).toMatchObject({ orderId: payload.checkout_id, total: 178.5 });
    expect(first.headers.get('set-cookie')).toMatch(/HttpOnly/i);
  });
  it('rejects a client-supplied stale price and a different address without reserving the item', async () => {
    const body = await fixture(),
      identity = randomUUID();
    const quote = await shipping(req(body, identity));
    jar.set(
      'sc_checkout_session',
      /sc_checkout_session=([^;]+)/.exec(quote.headers.get('set-cookie')!)![1]
    );
    const method = (await quote.json()).methods.find(
      (value: { code: string }) => value.code === 'SC_MZ_MAPUTO_CITY'
    );
    vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'true');
    const payload = {
      ...body,
      name: 'Synthetic Buyer',
      email: 'synthetic@example.invalid',
      phone: '+258841234567',
      checkout_id: randomUUID(),
      checkout_secret: randomUUID(),
      shipping_method_code: method.code,
      shipping_quote_id: method.quoteId,
    };
    const changedPrice = await checkout(
      req({ ...payload, items: [{ ...body.items[0], displayedPrice: 1 }] }, identity)
    );
    expect(changedPrice.status).toBe(409);
    const changedAddress = await checkout(req({ ...payload, city: 'Different City' }, identity));
    expect(changedAddress.status).toBe(409);
    expect((await changedAddress.json()).error).toMatch(/quote/);
  });
  it('freezes the exact Portador Diário MZN amount into a provincial order without contacting a carrier or payment gateway', async () => {
    const body = {
        ...(await fixture()),
        city: 'Beira',
        province: 'Sofala',
        local_area: 'Ponta Gea',
        postal_code: '2100',
      },
      identity = randomUUID();
    const quoted = await shipping(req(body, identity));
    expect(quoted.status).toBe(200);
    jar.set(
      'sc_checkout_session',
      /sc_checkout_session=([^;]+)/.exec(quoted.headers.get('set-cookie')!)![1]
    );
    const { methods } = await quoted.json();
    expect(methods).toHaveLength(1);
    const method = methods[0];
    expect(method).toMatchObject({
      source: 'portador_diario',
      price: 950.01,
      provider_currency: 'MZN',
    });
    vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'true');
    const response = await checkout(
      req(
        {
          ...body,
          name: 'Synthetic Buyer',
          email: 'synthetic@example.invalid',
          phone: '+258841234567',
          checkout_id: randomUUID(),
          checkout_secret: randomUUID(),
          shipping_method_code: method.code,
          shipping_quote_id: method.quoteId,
        },
        identity
      )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      subtotal: 78.5,
      shipping: 950.01,
      total: 1028.51,
    });
  });
  it('does not reuse the city price after the buyer changes to Albasine', async () => {
    const body = await fixture(),
      identity = randomUUID();
    const quoted = await shipping(req(body, identity));
    jar.set(
      'sc_checkout_session',
      /sc_checkout_session=([^;]+)/.exec(quoted.headers.get('set-cookie')!)![1]
    );
    const method = (await quoted.json()).methods[0];
    expect(method.price).toBe(100);
    vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'true');
    const response = await checkout(
      req(
        {
          ...body,
          local_area: 'Albasine',
          name: 'Synthetic Buyer',
          email: 'synthetic@example.invalid',
          phone: '+258841234567',
          checkout_id: randomUUID(),
          checkout_secret: randomUUID(),
          shipping_method_code: method.code,
          shipping_quote_id: method.quoteId,
        },
        identity
      )
    );
    expect(response.status).toBe(409);
  });
  it('refuses order creation without the delivery session cookie', async () => {
    const body = await fixture();
    vi.stubEnv('MPESA_PAYMENTS_ENABLED', 'true');
    const response = await checkout(
      req(
        {
          ...body,
          name: 'Synthetic Buyer',
          email: 'synthetic@example.invalid',
          phone: '+258841234567',
          checkout_id: randomUUID(),
          checkout_secret: randomUUID(),
          shipping_method_code: 'SC_MZ_MAPUTO_CITY',
          shipping_quote_id: randomUUID(),
        },
        randomUUID()
      )
    );
    expect(response.status).toBe(401);
  });
});
