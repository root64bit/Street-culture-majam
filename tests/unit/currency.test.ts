import { describe, expect, it } from 'vitest';
import { convertToMzn, sourceToMznRate, suggestDisplayCurrency } from '@/lib/currency';

describe('currency conversion', () => {
  const rates = { MZN: 1, USD: 1 / 64, EUR: 1 / 70, ZAR: 1 / 3.5, GBP: 1 / 82 };

  it('converts supported source prices into canonical MZN', () => {
    expect(sourceToMznRate('USD', rates)).toBe(64);
    expect(convertToMzn(100, 'USD', rates)).toBe(6400);
    expect(convertToMzn(125, 'MZN', rates)).toBe(125);
  });

  it('refuses conversion without a valid rate', () => {
    expect(convertToMzn(100, 'USD', { MZN: 1 })).toBeNull();
  });

  it('suggests a display currency from deployment country headers', () => {
    expect(suggestDisplayCurrency('MZ')).toBe('MZN');
    expect(suggestDisplayCurrency('ZA')).toBe('ZAR');
    expect(suggestDisplayCurrency('US')).toBe('USD');
    expect(suggestDisplayCurrency('GB')).toBe('GBP');
    expect(suggestDisplayCurrency('FR')).toBe('EUR');
  });
});
