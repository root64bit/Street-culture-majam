import { z } from 'zod';
export function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : '';
}
export function validId(value: string | undefined) {
  return z.string().uuid().safeParse(value).success ? value! : '';
}
export function pageNumber(value: string | undefined) {
  return Math.max(1, Math.min(10000, Number.parseInt(value ?? '1', 10) || 1));
}
