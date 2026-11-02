import { describe, expect, it } from 'vitest';
import {
  getMpesaInstallmentProgress,
  MPESA_MAX_TRANSACTION_MZN,
  splitMpesaAmount,
} from '@/lib/payments/mpesa-installments';
import { makeYakaPaymentRequest, initiateYakaPayment } from '@/lib/payments/yaka';

describe('M-Pesa installments', () => {
  it('keeps totals at or below the provider limit in one payment', () => {
    expect(splitMpesaAmount(MPESA_MAX_TRANSACTION_MZN)).toEqual([75_000]);
  });

  it('splits larger totals without exceeding 75,000 MZN', () => {
    expect(splitMpesaAmount(160_000)).toEqual([75_000, 75_000, 10_000]);
  });

  it('preserves centavos exactly across installments and remaining balances', () => {
    expect(splitMpesaAmount(150000.35)).toEqual([75000, 75000, 0.35]);
    expect(splitMpesaAmount(627.85)).toEqual([627.85]);
    expect(
      getMpesaInstallmentProgress(75000.35, [{ amount: 75000, status: 'SUCCEEDED' }])
    ).toMatchObject({
      paidAmount: 75000,
      remainingAmount: 0.35,
      nextInstallmentAmount: 0.35,
      installmentCount: 2,
    });
    expect(
      getMpesaInstallmentProgress(0.3, [
        { amount: 0.1, status: 'SUCCEEDED' },
        { amount: 0.2, status: 'SUCCEEDED' },
      ]).remainingAmount
    ).toBe(0);
    expect(() => splitMpesaAmount(10.001)).toThrow();
  });

  it('sends exact two-decimal MZN strings without rounding', () => {
    expect(
      makeYakaPaymentRequest({
        orderId: 'synthetic',
        amountMinor: 62785,
        currency: 'MZN',
        idempotencyKey: 'centavos-test',
        customerPhone: '258841234567',
      }).amount
    ).toBe('627.85');
    expect(
      makeYakaPaymentRequest({
        orderId: 'synthetic',
        amountMinor: 35,
        currency: 'MZN',
        idempotencyKey: 'centavos-test',
        customerPhone: '258841234567',
      }).amount
    ).toBe('0.35');
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
      initiateYakaPayment({
        orderId: 'order-test',
        amountMinor: (MPESA_MAX_TRANSACTION_MZN + 1) * 100,
        currency: 'MZN',
        idempotencyKey: 'installment-limit-test',
        customerPhone: '258841234567',
      })
    ).rejects.toThrow('at most 75000 MZN');
  });
});
