import type { CreatePaymentInput, PaymentGateway } from '@/lib/payments/types';
import { getMineScopePayment, initiateMineScopePayment } from '@/lib/payments/minescope';
import { PaymentGatewayUnavailableError } from '@/lib/payments/types';

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

export class SquareGateway implements PaymentGateway {
  async createPayment(_input: CreatePaymentInput): Promise<never> {
    if (process.env.SQUARE_PAYMENTS_ENABLED !== 'true') {
      throw new PaymentGatewayUnavailableError('Card payments are not enabled for this store.');
    }
    throw new PaymentGatewayUnavailableError(
      'Square is enabled only after a supported-country merchant adapter is configured.',
    );
  }

  async getPayment(_providerReference: string): Promise<never> {
    throw new PaymentGatewayUnavailableError();
  }

  async verifyWebhook(_request: Request): Promise<boolean> {
    return false;
  }
}
