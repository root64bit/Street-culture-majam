import { describe, expect, it } from 'vitest';
import { convertedMinor, moneyMinor, sumMoney, mpesaAmountEligible } from '@/lib/money';
describe('exact monetary policy', () => {
  it('preserves whole and fractional MZN without binary float summation', () => {
    expect(moneyMinor(1000)).toBe(100000);
    expect(moneyMinor('92610.33')).toBe(9261033);
    expect(sumMoney([0.1, 0.2, 10.25])).toBe(10.55);
    expect(sumMoney([92610.33, 105384.17, 100.49])).toBe(198094.99);
    expect(() => moneyMinor('1.001')).toThrow();
  });
  it('rounds FX only to the nearest destination minor unit, half up', () => {
    expect(convertedMinor(1.25, 0.5)).toBe(63);
    expect(convertedMinor(2392.66, 0.27, true)).toBe(886170);
    expect(convertedMinor(150001, 0.01234)).toBe(185101);
    expect(convertedMinor(0.01, 1e-5)).toBe(0);
  });
  it('offers M-Pesa only for exact whole totals; no catalog rounding', () => {
    expect(mpesaAmountEligible(75000)).toBe(true);
    expect(mpesaAmountEligible(150001)).toBe(true);
    expect(mpesaAmountEligible(sumMoney([1000, 0.49]))).toBe(false);
    expect(mpesaAmountEligible(1000.01)).toBe(false);
  });
});
