import { moneyMinor } from '@/lib/money';

export const MPESA_MAX_TRANSACTION_MZN = 75_000;
const MAX_MINOR = MPESA_MAX_TRANSACTION_MZN * 100;

export type MpesaPaymentRecord = {
  amount: number;
  status: string;
};

export type MpesaInstallmentProgress = {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  nextInstallmentAmount: number;
  installmentNumber: number;
  installmentCount: number;
};

export function splitMpesaAmount(totalAmount: number) {
  // Work only in integer centavos; never round the catalogue or wallet charge.
  let remaining = moneyMinor(totalAmount);
  const installments: number[] = [];
  while (remaining > 0) {
    const amount = Math.min(remaining, MAX_MINOR);
    installments.push(amount / 100);
    remaining -= amount;
  }
  return installments;
}

export function getMpesaInstallmentProgress(
  totalAmount: number,
  payments: MpesaPaymentRecord[]
): MpesaInstallmentProgress {
  const totalMinor = moneyMinor(totalAmount);
  const paidPayments = payments.filter((payment) => payment.status === 'SUCCEEDED');
  const paidMinor = paidPayments.reduce((sum, payment) => {
    const minor = moneyMinor(Number(payment.amount));
    if (minor <= 0 || minor > MAX_MINOR) throw new Error('Invalid confirmed M-Pesa installment.');
    return sum + minor;
  }, 0);

  if (paidMinor > totalMinor) {
    throw new Error('Confirmed M-Pesa installments exceed the order total.');
  }

  const remainingMinor = totalMinor - paidMinor;
  const installmentCount = Math.ceil(totalMinor / MAX_MINOR);
  return {
    totalAmount,
    paidAmount: paidMinor / 100,
    remainingAmount: remainingMinor / 100,
    nextInstallmentAmount: Math.min(remainingMinor, MAX_MINOR) / 100,
    installmentNumber: Math.min(paidPayments.length + 1, installmentCount),
    installmentCount,
  };
}
