export function formatOrderMoney(amount: number, currency = 'MZN') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function safeSquareReceiptUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (url.hostname === 'squareup.com' || url.hostname === 'receipts.squareup.com')
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function formatOrderTimestamp(value: string) {
  return `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value))} SAST`;
}
