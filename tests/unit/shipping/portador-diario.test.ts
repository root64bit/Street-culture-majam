// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPortadorDiarioQuote } from '@/lib/shipping/portador-diario';
const places = {
  success: true,
  data: [
    { id: 1, name: 'MAPUTO' },
    { id: 2, name: 'BEIRA' },
    { id: 4, name: 'NAMPULA' },
  ],
};
const quote = {
  success: true,
  data: { price: 950.01, currency: 'MT', route: 'MAPUTO - BEIRA', weight: 2, service: 'NORMAL' },
};
let transport: ReturnType<typeof vi.fn>;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  vi.stubEnv('SC_EXTERNAL_SERVICES', 'allowed');
  transport = vi.fn().mockResolvedValueOnce(reply(places)).mockResolvedValueOnce(reply(quote));
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('official Portador Diário domestic calculator', () => {
  it('uses the calculator scale IDs, not similarly numbered administrative province IDs', async () => {
    expect(await getPortadorDiarioQuote('Beira', 2)).toMatchObject({
      price: 950.01,
      to: { id: 2, name: 'BEIRA' },
    });
    expect(transport.mock.calls[1][0]).toBe('https://api.portadordiario.co.mz/api/domestico/quote');
    expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({
      origin: 1,
      destination: 2,
      weight: 2,
    });
    expect(
      transport.mock.calls.every(
        ([, options]) => options.redirect === 'error' && options.cache === 'no-store'
      )
    ).toBe(true);
  });
  it('does not invent a provincial-capital price for an unserved town', async () => {
    await expect(getPortadorDiarioQuote('Dondo', 2)).rejects.toMatchObject({ status: 422 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    { route: 'MAPUTO - NAMPULA' },
    { currency: 'ZAR' },
    { weight: 20 },
    { price: 0 },
    { price: 10.001 },
    { service: 'OTHER' },
  ])('rejects a mismatched or invalid carrier quote: %j', async (change) => {
    transport
      .mockReset()
      .mockResolvedValueOnce(reply(places))
      .mockResolvedValueOnce(reply({ ...quote, data: { ...quote.data, ...change } }));
    await expect(getPortadorDiarioQuote('Beira', 2)).rejects.toThrow();
  });
  it('does not fall back to a guessed price on an outage', async () => {
    transport.mockReset().mockRejectedValue(new Error('Offline'));
    await expect(getPortadorDiarioQuote('Beira', 2)).rejects.toThrow('temporarily unavailable');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('blocks real carrier access in isolated QA', async () => {
    vi.stubEnv('SC_EXTERNAL_SERVICES', 'disabled');
    await expect(getPortadorDiarioQuote('Beira', 2)).rejects.toThrow('External services');
    expect(transport).not.toHaveBeenCalled();
  });
});
