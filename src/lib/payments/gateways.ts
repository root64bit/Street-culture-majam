import type { CreatePaymentInput, PaymentGateway } from '@/lib/payments/types';
import { getMineScopePayment, initiateMineScopePayment } from '@/lib/payments/minescope';

export class MpesaGateway implements PaymentGateway {
  async createPayment(input: CreatePaymentInput) {
    return initiateMineScopePayment(input);
  }

  async getPayment(providerReference: string) {
    return getMineScopePayment(providerReference);
  }

  async verifyWebhook(_request: Request): Promise<boolean> {
    // The MineScope document does not define a signed callback payload or
    // signature-verification procedure. Checkout polls /status instead.
    return false;
  }
}
