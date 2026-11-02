import { describe, expect, it } from 'vitest';
import {
  catalogSizeValue,
  formatProductSize,
  NUMERIC_PRODUCT_SIZES,
  parseCatalogSize,
} from '@/lib/product-sizes';

describe('size identity is separate from displayed labels', () => {
  it('offers every half step without floating-point gaps or duplicate numbers', () => {
    expect(NUMERIC_PRODUCT_SIZES).toHaveLength(201);
    expect(new Set(NUMERIC_PRODUCT_SIZES).size).toBe(201);
    expect(NUMERIC_PRODUCT_SIZES.slice(18, 22)).toEqual(['9', '9.5', '10', '10.5']);
  });
  it('does not confuse UK 9 with US 9 and keeps legacy raw links working', () => {
    expect(catalogSizeValue('9', 'UK')).not.toBe(catalogSizeValue('9', 'US'));
    expect(parseCatalogSize('UK:9.5')).toEqual({ size: '9.5', sizeSystem: 'UK' });
    expect(parseCatalogSize('9')).toEqual({ size: '9' });
    expect(parseCatalogSize('STANDARD:OS')).toEqual({ size: 'OS', sizeSystem: 'STANDARD' });
  });
  it('labels actual systems and one-size products without performing a conversion', () => {
    expect(formatProductSize('9.5', 'UK')).toBe('UK 9.5');
    expect(formatProductSize('9.5', 'US')).toBe('US 9.5');
    expect(formatProductSize('UK 9.5', 'UK')).toBe('UK 9.5');
    expect(formatProductSize('OS', 'STANDARD')).toBe('One size');
    expect(formatProductSize('ONE_SIZE', 'STANDARD')).toBe('One size');
    expect(formatProductSize('XL', 'STANDARD')).toBe('XL');
  });
});
