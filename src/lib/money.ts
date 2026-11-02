// Integer minor units throughout. Only FX rounds, half up to the destination
// minor unit; catalog and order MZN amounts are never rounded.
export function decimalRatio(value: number | string): [bigint, bigint] {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match || (typeof value === 'number' && !Number.isFinite(value)))
    throw new Error('Invalid decimal amount.');
  const exponent = Number(match[3] || 0) - (match[2]?.length || 0);
  if (Math.abs(exponent) > 30) throw new Error('Decimal scale is unsupported.');
  const digits = BigInt(match[1] + (match[2] || ''));
  return exponent >= 0
    ? [digits * 10n ** BigInt(exponent), 1n]
    : [digits, 10n ** BigInt(-exponent)];
}
export function moneyMinor(amount: number | string): number {
  const [n, d] = decimalRatio(amount);
  if ((n * 100n) % d !== 0n || (n * 100n) / d > 999_999_999_999n)
    throw new Error('Money requires at most two decimal places.');
  return Number((n * 100n) / d);
}
export function sumMoney(amounts: (number | string)[]): number {
  const minor = amounts.reduce<number>((sum, value) => sum + moneyMinor(value), 0);
  if (!Number.isSafeInteger(minor) || minor > 999_999_999_999)
    throw new Error('Order amount is too large.');
  return minor / 100;
}
export function convertedMinor(amount: number, rate: number, inverse = false): number {
  const source = BigInt(moneyMinor(amount));
  const [n, d] = decimalRatio(rate);
  if (n <= 0n) throw new Error('Exchange rate must be positive.');
  const numerator = source * (inverse ? d : n),
    denominator = inverse ? n : d;
  const result = (numerator * 2n + denominator) / (2n * denominator);
  if (result > 999_999_999_999n) throw new Error('Converted amount is too large.');
  return Number(result);
}
export function mpesaAmountEligible(amount: number): boolean {
  try {
    const minor = moneyMinor(amount);
    return minor > 0;
  } catch {
    return false;
  }
}
