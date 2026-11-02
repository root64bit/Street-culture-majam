import 'server-only';
import { z } from 'zod';
import { assertExternalServicesAllowed } from '@/lib/external-services';
import { moneyMinor } from '@/lib/money';

const origin = 'https://api.portadordiario.co.mz/api';
const placesSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({ id: z.number().int().positive(), name: z.string().min(1) })),
});
const priceSchema = z.object({
  success: z.literal(true),
  data: z.object({
    price: z.number().positive(),
    currency: z.enum(['MT', 'MZN']),
    route: z.string(),
    weight: z.number().positive(),
    service: z.string(),
  }),
});
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export class PortadorDiarioError extends Error {
  constructor(
    message = 'Portador Diário prices are temporarily unavailable. Try again or contact support.',
    public readonly status = 503
  ) {
    super(message);
  }
}

async function api(path: '/domestico/scales' | '/domestico/quote', body?: object) {
  assertExternalServicesAllowed();
  try {
    const response = await fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new PortadorDiarioError();
    return await response.json();
  } catch {
    throw new PortadorDiarioError();
  }
}

export async function getPortadorDiarioQuote(city: string, weightKg: number) {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 100000)
    throw new PortadorDiarioError();
  const places = placesSchema.safeParse(await api('/domestico/scales'));
  if (!places.success) throw new PortadorDiarioError();
  const aliases: Record<string, string> = {
    'cidade de maputo': 'maputo',
    'maputo cidade': 'maputo',
    'maputo city': 'maputo',
    'xai xai': 'xai xai',
    'cidade de xai xai': 'xai xai',
    mocuba: 'quelimane mocuba',
    chokwe: 'chokwe',
    chocue: 'chokwe',
  };
  const destinationName = aliases[normalize(city)] || normalize(city);
  const from = places.data.data.find((p) => normalize(p.name) === 'maputo');
  const to = places.data.data.find((p) => normalize(p.name) === destinationName);
  if (!from || !to || from.id === to.id)
    throw new PortadorDiarioError(
      'Choose a destination city served by Portador Diário, or contact support for a delivery quote.',
      422
    );
  const parsed = priceSchema.safeParse(
    await api('/domestico/quote', { origin: from.id, destination: to.id, weight: weightKg })
  );
  if (!parsed.success) throw new PortadorDiarioError();
  const data = parsed.data.data;
  if (
    normalize(data.route) !== normalize(`${from.name} - ${to.name}`) ||
    Math.round(data.weight * 1000) !== Math.round(weightKg * 1000) ||
    data.service.toUpperCase() !== 'NORMAL'
  )
    throw new PortadorDiarioError();
  // Validate precision without rounding the carrier's price or changing centavos.
  const amountMinor = moneyMinor(data.price);
  if (amountMinor <= 0) throw new PortadorDiarioError();
  return {
    code: `PD_NORMAL_${to.id}`,
    name: `Portador Diário — ${to.name}`,
    price: amountMinor / 100,
    weightKg,
    from,
    to,
    quotedAt: new Date().toISOString(),
    service: data.service,
  };
}
