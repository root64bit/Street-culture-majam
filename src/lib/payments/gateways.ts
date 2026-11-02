import type { CreatePaymentInput, PaymentGateway } from '@/lib/payments/types';
import { getMineScopePayment } from '@/lib/payments/minescope';
import { getYakaPayment, initiateYakaPayment } from '@/lib/payments/yaka';
import { PaymentStatusUnavailableError } from '@/lib/payments/types';

export class MpesaGateway implements PaymentGateway {
  async createPayment(input: CreatePaymentInput) {
    return initiateYakaPayment(input);
  }

  async getPayment(providerReference: string) {
    if (/^SCMP[A-F0-9]{32}$/.test(providerReference)) return getYakaPayment(providerReference);
    // Historical attempts must stay with their original provider. This is a
    // status-only lookup, never a fallback debit after an owned-gateway error.
    if (/^ST[A-F0-9]{8}$/.test(providerReference)) return getMineScopePayment(providerReference);
    throw new PaymentStatusUnavailableError();
  }

  async verifyWebhook(_request: Request): Promise<boolean> {
    // The owned gateway exposes no customer callback. Reconcile by signed status.
    return false;
  }
}
