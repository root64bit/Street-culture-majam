export const MPESA_MAX_TRANSACTION_MZN = 75_000;

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

function requireWholeMzn(amount: number, name: string) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`${name} must be a non-negative whole-MZN amount.`);
  }
}

export function splitMpesaAmount(totalAmount: number) {
  requireWholeMzn(totalAmount, 'M-Pesa total');
  if (totalAmount === 0) return [];

  const installments: number[] = [];
  let remaining = totalAmount;
  while (remaining > 0) {
    const amount = Math.min(remaining, MPESA_MAX_TRANSACTION_MZN);
    installments.push(amount);
    remaining -= amount;
  }
  return installments;
}

export function getMpesaInstallmentProgress(
  totalAmount: number,
  payments: MpesaPaymentRecord[]
): MpesaInstallmentProgress {
  requireWholeMzn(totalAmount, 'M-Pesa total');
  const paidPayments = payments.filter((payment) => payment.status === 'SUCCEEDED');
  const paidAmount = paidPayments.reduce((sum, payment) => {
    requireWholeMzn(Number(payment.amount), 'Confirmed M-Pesa installment');
    return sum + Number(payment.amount);
  }, 0);

  if (paidAmount > totalAmount) {
    throw new Error('Confirmed M-Pesa installments exceed the order total.');
  }

  const remainingAmount = totalAmount - paidAmount;
  const installmentCount = splitMpesaAmount(totalAmount).length;
  return {
    totalAmount,
    paidAmount,
    remainingAmount,
    nextInstallmentAmount: Math.min(remainingAmount, MPESA_MAX_TRANSACTION_MZN),
    installmentNumber: Math.min(paidPayments.length + 1, installmentCount),
    installmentCount,
  };
}
