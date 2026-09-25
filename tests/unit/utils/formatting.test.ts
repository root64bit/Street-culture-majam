import { describe, it, expect } from 'vitest';
import { formatPrice, formatDate } from '@/lib/utils';

describe('Utility Formatting', () => {
  it('formats currency correctly across supported currencies', () => {
    expect(formatPrice(2840, 'USD')).toContain('2,840');
    expect(formatPrice(1500, 'EUR')).toContain('1,500');
    expect(formatPrice(950, 'GBP')).toContain('950');
  });

  it('formats valid dates correctly', () => {
    const formatted = formatDate('2026-09-25T12:00:00Z');
    expect(formatted).toContain('2026');
  });
});
