'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, LockKeyhole } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { formatSquareAmount } from '@/lib/payments/square-money';
import { shippingCountries as billingCountries } from '@/lib/shipping/countries';

export type SquareCheckoutQuote = {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  totalMzn: number;
  amount: number;
  amountMinor: number;
  currency: 'GBP';
  expiresAt: string;
};

type TokenResult = { status: string; token?: string };
type SquareMethod = {
  tokenize: (details?: Record<string, unknown>) => Promise<TokenResult>;
  attach?: (element: HTMLElement) => Promise<void>;
  destroy: () => Promise<void>;
};
type SquareSdk = {
  payments: (
    appId: string,
    locationId: string
  ) => {
    card: () => Promise<SquareMethod>;
    paymentRequest: (options: Record<string, unknown>) => unknown;
    applePay: (request: unknown) => Promise<SquareMethod>;
  };
};
const squareWindow = () => window as Window & { Square?: SquareSdk };
let sdkPromise: Promise<SquareSdk> | null = null;

function loadSdk() {
  if (squareWindow().Square) return Promise.resolve(squareWindow().Square!);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<SquareSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://web.squarecdn.com/v1/square.js';
    script.async = true;
    const timeout = window.setTimeout(() => fail(), 20_000);
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      sdkPromise = null;
      reject(new Error('Secure payment fields could not load. Please refresh and try again.'));
    };
    script.onload = () => {
      window.clearTimeout(timeout);
      const sdk = squareWindow().Square;
      if (sdk) resolve(sdk);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export function SquarePaymentForm({
  method,
  quote,
  contact,
  onToken,
  onUseCard,
}: {
  method: 'card' | 'applePay';
  quote: SquareCheckoutQuote;
  contact: { name: string; email: string; phone: string; country: string };
  onToken: (token: string) => Promise<void>;
  onUseCard: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const paymentMethod = useRef<SquareMethod | null>(null);
  const submitting = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [billingCountry, setBillingCountry] = useState(contact.country);
  const id = useId();

  useEffect(() => {
    let active = true;
    let instance: SquareMethod | null = null;
    setReady(false);
    setError('');
    const initialize = async () => {
      const applicationId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
      const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID;
      if (!applicationId || !locationId)
        throw new Error('Secure checkout is unavailable. Please contact the store.');
      const sdk = await loadSdk();
      if (!active) return;
      const payments = sdk.payments(applicationId, locationId);
      if (method === 'card') {
        instance = await payments.card();
        if (active && container.current) await instance.attach?.(container.current);
      } else {
        const request = payments.paymentRequest({
          countryCode: 'GB',
          currencyCode: 'GBP',
          total: { amount: quote.amount.toFixed(2), label: 'Street Culture' },
        });
        instance = await payments.applePay(request);
      }
      if (!active) {
        await instance.destroy();
        return;
      }
      paymentMethod.current = instance;
      setReady(true);
    };
    void initialize().catch(() => {
      if (active)
        setError(
          method === 'applePay'
            ? 'Apple Pay is unavailable on this device or browser. You can pay by card instead.'
            : 'Secure card fields could not load. Check your connection and refresh to try again.'
        );
    });
    return () => {
      active = false;
      paymentMethod.current = null;
      void instance?.destroy();
    };
  }, [method, quote.amount, quote.paymentId]);

  const pay = () => {
    if (!ready || !paymentMethod.current || submitting.current) return;
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      setError('Your checkout reservation has expired. Start a new checkout.');
      return;
    }
    submitting.current = true;
    // Apple Pay must start synchronously in this click handler, before awaiting
    // any work, so Safari retains the user gesture required for the wallet.
    let tokenization: Promise<TokenResult>;
    try {
      const [givenName, ...familyName] = contact.name.trim().split(/\s+/);
      tokenization = paymentMethod.current.tokenize(
        method === 'card'
          ? {
              amount: quote.amount.toFixed(2),
              currencyCode: 'GBP',
              intent: 'CHARGE',
              customerInitiated: true,
              sellerKeyedIn: false,
              billingContact: {
                givenName,
                familyName: familyName.join(' '),
                email: contact.email,
                phone: contact.phone,
                countryCode: billingCountry,
              },
            }
          : undefined
      );
    } catch {
      submitting.current = false;
      setError('Payment could not start. Please try again.');
      return;
    }
    setBusy(true);
    setError('');
    void tokenization
      .then(async (result) => {
        if (result.status === 'Cancel' || result.status === 'CANCEL') return;
        if (result.status !== 'OK' || !result.token) {
          throw new Error('Check your payment details and complete any bank verification prompt.');
        }
        await onToken(result.token);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Payment could not be completed.');
      })
      .finally(() => {
        submitting.current = false;
        setBusy(false);
      });
  };

  return (
    <div className="mt-6 rounded-2xl border border-black/15 bg-white p-5">
      <p className="text-sm font-bold">
        {method === 'applePay' ? 'Apple Pay' : 'Credit or debit card'}
      </p>
      <p className="mt-2 text-sm">
        You will be charged <strong>{formatSquareAmount(quote.amount)}</strong>.
      </p>
      <p className="mt-1 text-xs leading-5 text-black/55">
        Converted from {formatPrice(quote.totalMzn, 'MZN')}. Your bank may apply a currency
        conversion fee.
      </p>
      {method === 'card' && (
        <>
          <label htmlFor={`${id}-country`} className="mt-5 block text-xs font-semibold">
            Card billing country
          </label>
          <select
            id={`${id}-country`}
            value={billingCountry}
            disabled={busy}
            onChange={(event) => setBillingCountry(event.target.value)}
            className="mb-4 mt-2 w-full rounded-xl border border-black/15 bg-white p-3 text-sm"
          >
            {billingCountries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          <div ref={container} className="min-h-28" />
        </>
      )}
      {!ready && !error && (
        <p className="mt-4 flex items-center gap-2 text-sm" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading secure payment…
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {ready && (
        <button
          type="button"
          onClick={pay}
          disabled={busy}
          aria-label={
            method === 'applePay'
              ? `Pay ${formatSquareAmount(quote.amount)} with Apple Pay`
              : undefined
          }
          className={
            method === 'applePay'
              ? 'square-apple-pay mt-5 w-full disabled:opacity-50'
              : 'h-13 mt-4 w-full rounded-full bg-black text-sm font-bold text-white disabled:opacity-50'
          }
        >
          {method === 'card'
            ? busy
              ? 'Processing payment…'
              : `Pay ${formatSquareAmount(quote.amount)}`
            : null}
        </button>
      )}
      {method === 'applePay' && !busy && (
        <button
          type="button"
          onClick={onUseCard}
          className="mt-4 w-full text-xs font-semibold underline"
        >
          Pay by card instead
        </button>
      )}
      <p className="mt-4 flex items-center justify-center gap-2 text-xs text-black/45">
        <LockKeyhole className="h-3 w-3" /> Secure payment by Square
      </p>
    </div>
  );
}
