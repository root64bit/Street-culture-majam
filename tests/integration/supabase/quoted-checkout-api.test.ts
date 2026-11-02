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
    const id = randomUUID();
    const row = await db
      .from('listings')
      .insert({
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
      (value: { code: string }) => value.code === 'TEST_MZ'
    );
    expect(method).toMatchObject({
      price: 125.25,
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
      shipping: 125.25,
      total: 203.75,
    });
    expect(await second.json()).toMatchObject({ orderId: payload.checkout_id, total: 203.75 });
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
      (value: { code: string }) => value.code === 'TEST_MZ'
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
          shipping_method_code: 'TEST_MZ',
          shipping_quote_id: randomUUID(),
        },
        randomUUID()
      )
    );
    expect(response.status).toBe(401);
  });
});
