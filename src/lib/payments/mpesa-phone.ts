/** Canonical Mozambique wallet number, independent of the delivery country. */
export function normalizeMpesaPhone(value: string): string | null {
  const compact = value.trim().replace(/[ ()-]/g, '');
  if (!/^(?:\+?258)?(?:84|85)\d{7}$/.test(compact)) return null;
  const digits = compact.replace(/^\+/, '');
  return digits.length === 9 ? `258${digits}` : digits;
}
