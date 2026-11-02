export const PRODUCT_SIZE_SYSTEMS = ['UK', 'US', 'EU', 'CM', 'STANDARD'] as const;
export type ProductSizeSystem = (typeof PRODUCT_SIZE_SYSTEMS)[number];

// Input choices, not a stock list or a brand conversion chart.
export const NUMERIC_PRODUCT_SIZES = Array.from({ length: 201 }, (_, index) => String(index / 2));
const apparelSizes = [
  'OS',
  'XXXS',
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '3XL',
  '4XL',
  '5XL',
  '6XL',
];

export function productSizeChoices(system: string): readonly string[] {
  return system === 'STANDARD'
    ? [...apparelSizes, ...NUMERIC_PRODUCT_SIZES]
    : NUMERIC_PRODUCT_SIZES;
}

export function formatProductSize(size: string, system?: string | null): string {
  const label = size.trim();
  if (/^(OS|O\/S|ONE[ _-]?SIZE)$/i.test(label)) return 'One size';
  if (!system || system === 'STANDARD' || /^(UK|US|EU|CM)\s/i.test(label)) return label;
  return `${system} ${label}`;
}

export function isFootwearProduct(category: string, name = '') {
  return /\b(sneakers?|shoes?|footwear|boots?|trainers?|loafers?|sandals?|heels?|slippers?|slides?)\b/i
    .test(category.replaceAll('-', ' ')) ||
    /\b(sneakers?|shoes?|boots?|trainers?|loafers?|sandals?|heels?)\b/i.test(name);
}

export function isPurchasableSize(size: string, system: string | undefined, footwear: boolean) {
  if (!size.trim()) return false;
  if (!footwear) return true;
  const match = /^(?:(UK|US|EU|CM)\s+)?(\d{1,3}(?:\.\d{1,2})?)$/i.exec(size.trim());
  if (!match || Number(match[2]) > 100) return false;
  const prefix = match[1]?.toUpperCase();
  const actual = system?.toUpperCase();
  if (prefix && actual && actual !== 'STANDARD' && actual !== prefix) return false;
  return Boolean(prefix || ['UK', 'US', 'EU', 'CM'].includes(actual || ''));
}

export function catalogSizeValue(size: string, system?: string): string {
  return system ? `${system}:${size}` : size;
}

export function parseCatalogSize(value: string): { size?: string; sizeSystem?: string } {
  const separator = value.indexOf(':');
  const system = value.slice(0, separator);
  if (separator > 0 && PRODUCT_SIZE_SYSTEMS.includes(system as ProductSizeSystem)) {
    return { size: value.slice(separator + 1) || undefined, sizeSystem: system };
  }
  return { size: value || undefined };
}
