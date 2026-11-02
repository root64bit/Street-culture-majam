// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  rates: vi.fn(),
  exchange: vi.fn(),
  portador: vi.fn(),
}));
vi.mock('@/lib/shipping/portador-diario', async (original) => ({
  ...(await original<typeof import('@/lib/shipping/portador-diario')>()),
  getPortadorDiarioQuote: mock.portador,
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mock.from, rpc: mock.rpc }),
}));
vi.mock('@/lib/payments/guest-checkout', () => ({
  consumeGuestCheckoutRateLimit: async () => true,
}));
vi.mock('@/lib/shipping/internet-express', async (original) => ({
  ...(await original<typeof import('@/lib/shipping/internet-express')>()),
  internetExpressConfigured: () => true,
  getInternetExpressRates: mock.rates,
}));
vi.mock('@/lib/currency', async (original) => ({
  ...(await original<typeof import('@/lib/currency')>()),
  fetchMznExchangeRates: mock.exchange,
}));
import { POST } from '@/app/api/checkout/shipping/route';
import { maputoDeliveryZones } from '@/lib/shipping/maputo-delivery';
const listingId = '11111111-1111-4111-8111-111111111111';
const destination = {
  address_line_1: 'Synthetic Street 1',
  address_line_2: '',
  local_area: 'Central',
  city: 'Maputo',
  province: 'Maputo',
  postal_code: '1100',
  country: 'MZ',
  items: [{ listingId, size: 'UK 8' }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.from.mockImplementation((table: string) =>
    table === 'public_catalog_listings'
      ? {
          select: () => ({
            in: async () => ({
              data: [{ listing_id: listingId, size: 'UK 8', asking_price: 5000 }],
              error: null,
            }),
          }),
        }
      : {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({
                  data: maputoDeliveryZones.map((z, i) => ({
                    id: `22222222-2222-4222-8222-22222222222${i}`,
                    code: z.code,
                    name: z.name,
                    price: z.initialPrice,
                    currency: 'MZN',
                    region: null,
                    estimated_min_days: 0,
                    estimated_max_days: 0,
                  })),
                  error: null,
                }),
              }),
            }),
          }),
        }
  );
  mock.rpc.mockResolvedValue({
    data: [
      {
        quote_id: '33333333-3333-4333-8333-333333333333',
        quote_expires_at: new Date(Date.now() + 600000).toISOString(),
      },
    ],
    error: null,
  });
  mock.exchange.mockResolvedValue({
    rates: { MZN: 1, ZAR: 0.25 },
    updatedAt: new Date().toISOString(),
  });
  mock.portador.mockResolvedValue({
    code: 'PD_NORMAL_2',
    name: 'Portador Diário — BEIRA',
    price: 1234.56,
    weightKg: 2,
    from: { id: 1, name: 'MAPUTO' },
    to: { id: 2, name: 'BEIRA' },
    quotedAt: new Date().toISOString(),
    service: 'NORMAL',
  });
  mock.rates.mockResolvedValue({
    rates: [
      {
        serviceId: 12,
        code: 'ECO',
        name: 'Economy',
        description: '',
        amount: 250,
        currency: 'ZAR',
        deliveryFrom: null,
        deliveryTo: null,
      },
    ],
    quotedAt: new Date().toISOString(),
    collectionAddress: {},
  });
});
afterEach(() => vi.unstubAllEnvs());
const request = (overrides: object) =>
  POST(
    new Request('https://www.streetculturevault.com/api/checkout/shipping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...destination, ...overrides }),
    })
  );
describe('server-owned Maputo quotes and provincial courier rates', () => {
  it.each([
    ['Central', 100],
    ['Costa do Sol', 200],
    ['Albasine', 500],
    ['Matola', 500],
  ])(
    'issues one exact stored quote for %s without a courier or FX lookup',
    async (local_area, price) => {
      const response = await request({ local_area });
      expect(response.status).toBe(200);
      const { methods } = await response.json();
      expect(methods).toHaveLength(1);
      expect(methods[0]).toMatchObject({
        price,
        currency: 'MZN',
        source: 'configured',
        quoteId: expect.any(String),
      });
      expect(mock.rpc).toHaveBeenCalledWith(
        'issue_checkout_shipping_quote',
        expect.objectContaining({
          target_destination: expect.objectContaining({ local_area }),
          target_amount_mzn: price,
          target_provider: 'configured',
          target_exchange_rate: 1,
        })
      );
      expect(mock.rates).not.toHaveBeenCalled();
      expect(mock.exchange).not.toHaveBeenCalled();
      expect(mock.portador).not.toHaveBeenCalled();
    }
  );
  it('uses Portador Diário for Sofala and never the South African courier', async () => {
    const response = await request({
      city: 'Beira',
      province: 'Sofala',
      local_area: 'Ponta Gea',
      postal_code: '2100',
    });
    expect(response.status).toBe(200);
    const { methods } = await response.json();
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatchObject({
      source: 'portador_diario',
      price: 1234.56,
      code: 'PD_NORMAL_2',
    });
    expect(mock.portador).toHaveBeenCalledWith('Beira', 2);
    expect(mock.rates).not.toHaveBeenCalled();
    expect(mock.exchange).not.toHaveBeenCalled();
  });
  it('never substitutes a cheap local rate when the provincial courier is unavailable', async () => {
    mock.portador.mockRejectedValue(new Error('Courier unavailable'));
    const response = await request({ city: 'Nampula', province: 'Nampula', local_area: 'Central' });
    expect(response.status).toBe(503);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('never requests Internet Express prices for the Mozambique-held stock', async () => {
    await request({ country: 'ZA', city: 'Pretoria', province: 'Gauteng', postal_code: '0081' });
    expect(mock.rates).not.toHaveBeenCalled();
    expect(mock.exchange).not.toHaveBeenCalled();
  });
});
