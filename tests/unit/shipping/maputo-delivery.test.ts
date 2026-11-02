import { describe, expect, it } from 'vitest';
import {
  configuredMethodApplies,
  maputoDeliveryZone,
  maputoDeliveryZones,
} from '@/lib/shipping/maputo-delivery';

const destination = { country: 'MZ', province: 'Maputo', city: 'Maputo', local_area: 'Central' };
describe('Maputo local delivery zones', () => {
  it.each([
    ['Central', 100],
    ['Polana', 100],
    ['Costa do Sol', 200],
    ['Costa de Sol', 200],
    ['Bairro da Costa do Sol', 200],
    ['Albasine', 500],
    ['Albasini', 500],
    ['Bairro Albasine', 500],
    ['Matola', 500],
  ])('charges the right local fee for %s', (local_area, price) => {
    expect(maputoDeliveryZone({ ...destination, local_area })?.initialPrice).toBe(price);
  });
  it('recognizes Matola as a city and Portuguese province names', () => {
    expect(
      maputoDeliveryZone({
        ...destination,
        city: 'Matola',
        local_area: 'Fomento',
        province: 'Província de Maputo',
      })?.initialPrice
    ).toBe(500);
  });
  it('normalizes case, whitespace, accents and hyphens', () => {
    expect(
      maputoDeliveryZone({
        ...destination,
        country: ' mz ',
        city: ' MAPUTO ',
        local_area: 'Costa-do-Sol',
      })?.initialPrice
    ).toBe(200);
  });
  it.each([
    { country: 'ZA' },
    { city: 'Beira' },
    { city: 'Boane' },
    { city: 'Marracuene' },
    { province: 'Gauteng' },
    { province: 'Nampula' },
  ])('does not apply city delivery prices outside the covered area: %j', (overrides) => {
    expect(maputoDeliveryZone({ ...destination, ...overrides })).toBeNull();
  });
  it('returns only the applicable configured method, never a cheaper alternative', () => {
    const address = { ...destination, local_area: 'Albasine' };
    const options = [
      ...maputoDeliveryZones.map((zone) => ({ code: zone.code, region: null })),
      { code: 'GLOBAL_MZ', region: null },
    ];
    expect(
      options
        .filter((method) => configuredMethodApplies(method, address))
        .map((method) => method.code)
    ).toEqual(['SC_MZ_ALBASINE']);
  });
  it('excludes local and generic configured rates from provincial destinations', () => {
    const address = { ...destination, city: 'Beira', province: 'Sofala' };
    expect(
      maputoDeliveryZones.some((zone) =>
        configuredMethodApplies({ ...zone, region: null }, address)
      )
    ).toBe(false);
    expect(configuredMethodApplies({ code: 'OTHER_SERVICE', region: 'Sofala' }, address)).toBe(
      false
    );
    expect(configuredMethodApplies({ code: 'OTHER_SERVICE', region: 'Maputo' }, address)).toBe(
      false
    );
  });
  it('retains separately configured international services', () => {
    expect(
      configuredMethodApplies(
        { code: 'OTHER_SERVICE', region: 'Gauteng' },
        {
          country: 'ZA',
          province: 'Gauteng',
          city: 'Pretoria',
          local_area: 'Central',
        }
      )
    ).toBe(true);
  });
});
