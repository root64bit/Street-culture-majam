// Customer delivery fees, not the merchant's actual fulfillment costs.
export const maputoDeliveryZones = [
  { code: 'SC_MZ_MAPUTO_CITY', name: 'Local delivery — Maputo city', initialPrice: 100 },
  { code: 'SC_MZ_COSTA_DO_SOL', name: 'Local delivery — Costa do Sol', initialPrice: 200 },
  { code: 'SC_MZ_ALBASINE', name: 'Local delivery — Albasine', initialPrice: 500 },
  { code: 'SC_MZ_MATOLA', name: 'Local delivery — Matola', initialPrice: 500 },
] as const;

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function maputoDeliveryZone(destination: {
  country: string;
  province: string;
  city: string;
  local_area: string;
}) {
  if (destination.country.trim().toUpperCase() !== 'MZ') return null;
  const province = normalized(destination.province);
  if (
    ![
      'maputo',
      'maputo cidade',
      'maputo city',
      'cidade de maputo',
      'provincia de maputo',
      'maputo province',
    ].includes(province)
  )
    return null;
  const city = normalized(destination.city),
    area = normalized(destination.local_area);
  // Specific areas precede the general city fee. Never apply Maputo's fee
  // solely because the province is Maputo (for example Marracuene or Boane).
  if (/^(?:cidade da |cidade de )?matola(?: |$)/.test(city)) return maputoDeliveryZones[3];
  if (!['maputo', 'maputo cidade', 'maputo city', 'cidade de maputo'].includes(city)) return null;
  if (/(?:^| )matola(?: |$)/.test(area)) return maputoDeliveryZones[3];
  if (/(?:^| )albasin[ei](?: |$)/.test(area)) return maputoDeliveryZones[2];
  if (/(?:^| )costa (?:do|de) sol(?: |$)/.test(area)) return maputoDeliveryZones[1];
  return maputoDeliveryZones[0];
}

export function isMaputoDeliveryCode(code: string) {
  return maputoDeliveryZones.some((zone) => zone.code === code);
}

export function configuredMethodApplies(
  method: { code: string; region: string | null },
  destination: { country: string; province: string; city: string; local_area: string }
) {
  const local = maputoDeliveryZone(destination);
  if (local) return method.code === local.code;
  if (destination.country.trim().toUpperCase() === 'MZ') return false;
  if (isMaputoDeliveryCode(method.code)) return false;
  return !method.region || method.region.toLowerCase() === destination.province.toLowerCase();
}
