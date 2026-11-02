import { describe, expect, it } from 'vitest';
import {
  getMpesaInstallmentProgress,
  MPESA_MAX_TRANSACTION_MZN,
  splitMpesaAmount,
} from '@/lib/payments/mpesa-installments';
import { initiateMineScopePayment } from '@/lib/payments/minescope';

describe('M-Pesa installments', () => {
  it('keeps totals at or below the provider limit in one payment', () => {
    expect(splitMpesaAmount(MPESA_MAX_TRANSACTION_MZN)).toEqual([75_000]);
  });

  it('splits larger totals without exceeding 75,000 MZN', () => {
    expect(splitMpesaAmount(160_000)).toEqual([75_000, 75_000, 10_000]);
  });

  it('calculates the next installment from provider-confirmed payments only', () => {
    expect(
      getMpesaInstallmentProgress(160_000, [
        { amount: 75_000, status: 'SUCCEEDED' },
        { amount: 75_000, status: 'FAILED' },
      ])
    ).toEqual({
      totalAmount: 160_000,
      paidAmount: 75_000,
      remainingAmount: 85_000,
      nextInstallmentAmount: 75_000,
      installmentNumber: 2,
      installmentCount: 3,
    });
  });

  it('rejects an overpayment instead of silently confirming the order', () => {
    expect(() =>
      getMpesaInstallmentProgress(100_000, [
        { amount: 75_000, status: 'SUCCEEDED' },
        { amount: 50_000, status: 'SUCCEEDED' },
      ])
    ).toThrow('exceed the order total');
  });

  it('refuses to send a provider request above the per-transaction limit', async () => {
    await expect(
      initiateMineScopePayment({
        orderId: 'order-test',
        amountMinor: (MPESA_MAX_TRANSACTION_MZN + 1) * 100,
        currency: 'MZN',
        idempotencyKey: 'installment-limit-test',
        customerPhone: '258841234567',
      })
    ).rejects.toThrow('at most 75000 MZN');
  });
});
