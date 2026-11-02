import { describe, expect, it } from 'vitest';
import { normalizeMpesaPhone } from '@/lib/payments/mpesa-phone';
describe('M-Pesa wallet numbers for any delivery destination', () => {
  it.each(['841234567', '258841234567', '+258841234567', '+258 84 123 4567', '(258) 84-123-4567'])(
    'normalizes %s to the same wallet',
    (value) => {
      expect(normalizeMpesaPhone(value)).toBe('258841234567');
    }
  );
  it('supports the 85 prefix', () =>
    expect(normalizeMpesaPhone('+258851234567')).toBe('258851234567'));
  it.each([
    '+27110000000',
    '+254841234567',
    '+258861234567',
    '+84812345678',
    'abc841234567',
    '',
    '+25884123456',
  ])('rejects non-wallet input %s', (value) => expect(normalizeMpesaPhone(value)).toBeNull());
});
