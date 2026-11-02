import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ commerce: {} as Record<string, unknown> }));
vi.mock('@/features/commerce/CommerceProvider', () => ({ useCommerce: () => state.commerce }));
vi.mock('next/image', () => ({ default: () => <span /> }));
vi.mock('@/features/currency/CurrencyProvider', () => ({
  DisplayPrice: ({ amount }: { amount: number }) => <span>{amount}</span>,
}));
vi.mock('@/components/payments/SquarePaymentForm', () => ({
  SquarePaymentForm: () => <div>Retired Square form</div>,
}));
// Deliberately do NOT mock the real production provider policy.
import { CheckoutSheet } from '@/components/commerce/CommerceOverlays';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.stubEnv('NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PAYMENTS_ENABLED', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === '/api/account/checkout'
              ? { signedIn: false }
              : {
                  methods: [
                    {
                      quoteId: 'quote',
                      expiresAt: new Date(Date.now() + 600000).toISOString(),
                      code: 'TEST',
                      name: 'Test delivery',
                      price: 125,
                      source: 'configured',
                    },
                  ],
                }
          )
        )
    )
  );
  state.commerce = {
    checkoutOpen: true,
    closeCheckout: vi.fn(),
    clearCart: vi.fn(),
    subtotal: 78,
    cart: [
      {
        listingId: 'test-listing',
        size: 'OS',
        quantity: 1,
        product: { id: 'test-listing', name: 'Test item', price: 78, image: '/test.jpg' },
      },
    ],
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function reachPayment() {
  render(<CheckoutSheet />);
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Buyer' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.invalid' } });
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+258841234567' } });
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
  fireEvent.change(screen.getByLabelText('Address line 1'), {
    target: { value: 'Example Street 1' },
  });
  fireEvent.change(screen.getByLabelText('Suburb / local area'), { target: { value: 'Central' } });
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '1100' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650);
  });
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
}
describe('real checkout provider policy', () => {
  it('keeps M-Pesa and hides disconnected gateways even with stale enabled flags', async () => {
    await reachPayment();
    expect(screen.getByRole('button', { name: /^M-Pesa Mozambique/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Stripe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Card / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apple Pay / })).not.toBeInTheDocument();
    expect(screen.queryByText(/PayFast/)).not.toBeInTheDocument();
    expect(screen.queryByText('Retired Square form')).not.toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/payments/'))
    ).toBe(false);
  });
  it('prevents checkout when M-Pesa is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED', 'false');
    await reachPayment();
    expect(screen.queryByRole('button', { name: /Stripe/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
    expect(screen.getByText(/Online payments are temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/You can pay with an eligible/)).not.toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/payments/'))
    ).toBe(false);
  });
});
