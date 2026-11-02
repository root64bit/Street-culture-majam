import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SquarePaymentForm } from '@/components/payments/SquarePaymentForm';
const quote = {
  paymentId: 'payment',
  orderId: 'order',
  orderNumber: 'SC00000000',
  totalMzn: 627.85,
  amount: 7.4,
  amountMinor: 740,
  currency: 'GBP' as const,
  expiresAt: new Date(Date.now() + 600000).toISOString(),
};
const contact = {
  name: 'Test Buyer',
  email: 'test@example.invalid',
  phone: '+27110000000',
  country: 'ZA',
};
const tokenize = vi.fn(),
  applePay = vi.fn(),
  destroy = vi.fn(),
  request = vi.fn();
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SQUARE_APPLICATION_ID', 'test-only-app');
  vi.stubEnv('NEXT_PUBLIC_SQUARE_LOCATION_ID', 'test-only-location');
  vi.stubGlobal('isSecureContext', true);
  tokenize.mockReset().mockResolvedValue({ status: 'OK', token: 'synthetic-token' });
  destroy.mockReset().mockResolvedValue(undefined);
  applePay.mockReset().mockResolvedValue({ tokenize, destroy });
  request.mockReset();
  Object.defineProperty(window, 'Square', {
    configurable: true,
    value: { payments: () => ({ applePay, paymentRequest: request, card: vi.fn() }) },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'Square');
});
describe('Apple Pay checkout behavior', () => {
  it('initializes the GBP wallet and tokenizes only after a click', async () => {
    const onToken = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      render(
        <SquarePaymentForm
          method="applePay"
          quote={quote}
          contact={contact}
          onToken={onToken}
          onUseCard={vi.fn()}
        />
      );
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        countryCode: 'GB',
        currencyCode: 'GBP',
        total: { amount: '7.40', label: 'Street Culture' },
      })
    );
    expect(tokenize).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pay £7.40 with Apple Pay' }));
      expect(tokenize).toHaveBeenCalledOnce();
    });
    expect(onToken).toHaveBeenCalledWith('synthetic-token');
  });
  it('explains a merchant-domain problem without claiming a device failure', async () => {
    applePay.mockRejectedValue({
      name: 'PaymentMethodUnsupportedError',
      message: 'Your website domain is not verified',
    });
    await act(async () => {
      render(
        <SquarePaymentForm
          method="applePay"
          quote={quote}
          contact={contact}
          onToken={vi.fn()}
          onUseCard={vi.fn()}
        />
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent('verify this store connection');
    expect(screen.getByRole('alert')).not.toHaveTextContent('unavailable on this device');
    expect(tokenize).not.toHaveBeenCalled();
  });
  it('offers a retry after a load error and preserves card fallback', async () => {
    applePay.mockRejectedValueOnce(new Error('offline'));
    const onUseCard = vi.fn();
    await act(async () => {
      render(
        <SquarePaymentForm
          method="applePay"
          quote={quote}
          contact={contact}
          onToken={vi.fn()}
          onUseCard={onUseCard}
        />
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Check your connection');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try loading again' }));
    });
    expect(screen.getByRole('button', { name: 'Pay £7.40 with Apple Pay' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pay by card instead' }));
    expect(onUseCard).toHaveBeenCalledOnce();
  });
});
