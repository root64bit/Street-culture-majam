export type PaymentProviderName = 'mpesa' | 'square';
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export interface CreatePaymentInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  customerPhone?: string;
  sourceId?: string;
}

export interface ProviderPayment {
  provider: PaymentProviderName;
  providerReference: string;
  status: PaymentStatus;
  providerTransactionId?: string;
  conversationId?: string;
  responseCode?: string;
  responseDescription?: string;
}

export interface PaymentGateway {
  createPayment(input: CreatePaymentInput): Promise<ProviderPayment>;
  getPayment(providerReference: string): Promise<ProviderPayment>;
  verifyWebhook(request: Request): Promise<boolean>;
}

export class PaymentGatewayUnavailableError extends Error {
  constructor(message = 'This payment method is not configured for this store.') {
    super(message);
    this.name = 'PaymentGatewayUnavailableError';
  }
}

export class PaymentOutcomeUnknownError extends Error {
  constructor() {
    super('Payment request outcome is unknown; check the existing provider reference before retrying.');
    this.name = 'PaymentOutcomeUnknownError';
  }
}
