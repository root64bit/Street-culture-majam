import { shippingCountries } from './countries';

export const southAfricaProvinces = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
] as const;

export function addressLines(address: Record<string, unknown>) {
  const text = (key: string) => (typeof address[key] === 'string' ? address[key].trim() : '');
  const code = text('country').toUpperCase();
  return [
    text('name'),
    text('address_line_1'),
    text('address_line_2'),
    text('local_area'),
    [text('city'), text('province'), text('postal_code')].filter(Boolean).join(', '),
    shippingCountries.find((country) => country.code === code)?.name || code,
    text('phone'),
  ].filter(Boolean);
}

export function addressProblems(address: Record<string, unknown>): string[] {
  const required = [
    'name',
    'phone',
    'address_line_1',
    'local_area',
    'city',
    'province',
    'postal_code',
    'country',
  ];
  const problems = required
    .filter((key) => !String(address[key] ?? '').trim())
    .map((key) => `Missing ${key.replaceAll('_', ' ')}`);
  if (
    address.country === 'ZA' &&
    !southAfricaProvinces.some(
      (p) => p.toLowerCase() === String(address.province ?? '').toLowerCase()
    )
  )
    problems.push('Confirm a valid South African province separately from the city.');
  if (address.country === 'ZA' && !/^\d{4}$/.test(String(address.postal_code ?? '')))
    problems.push('Confirm the four-digit South African postal code.');
  return problems;
}
