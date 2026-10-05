'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type { StoreProduct } from '@/data/storefront';
import { formatPrice } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useCommerce, type CartLine } from '@/features/commerce/CommerceProvider';

function DialogShell({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/35 backdrop-blur-sm"
        onClick={onClose}
        aria-label={`Close ${title}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'absolute bottom-0 left-0 right-0 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] bg-[#fbfaf6] text-black shadow-2xl outline-none md:bottom-0 md:left-auto md:top-0 md:rounded-none md:rounded-l-[2rem]',
          wide ? 'md:w-[min(92vw,720px)]' : 'md:w-[min(92vw,520px)]',
        )}
      >
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-black/10 bg-[#fbfaf6]/90 px-5 py-4 backdrop-blur-xl md:px-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white transition hover:bg-black hover:text-white"
            aria-label={`Close ${title}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function QuickBuyContent({ product }: { product: StoreProduct }) {
  const { addToCart, closeQuickBuy } = useCommerce();
  const [size, setSize] = useState('');
  const [showError, setShowError] = useState(false);

  const add = (buyNow: boolean) => {
    if (!size) {
      setShowError(true);
      return;
    }
    addToCart(product, size, buyNow);
  };

  return (
    <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
      <div className="relative min-h-[280px] overflow-hidden bg-[#ece9e1] md:min-h-[calc(100dvh-73px)]">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover"
          style={{ objectPosition: product.imagePosition }}
        />
        <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-acid" /> Verified
        </div>
      </div>
      <div className="flex flex-col px-5 py-7 md:px-8 md:py-10">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">
          {product.brand}
        </p>
        <h2 className="text-3xl font-black leading-[0.98] tracking-[-0.04em]">{product.name}</h2>
        <p className="mt-4 text-2xl font-bold">{formatPrice(product.price, 'MZN')}</p>

        <div className="mt-8 flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-[0.12em]">Select size</label>
          <span className="text-xs text-black/45">{product.condition}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {product.sizes.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSize(option);
                setShowError(false);
              }}
              aria-pressed={size === option}
              className={cn(
                'min-h-11 rounded-xl border text-sm font-semibold transition',
                size === option
                  ? 'border-black bg-black text-white'
                  : 'border-black/15 bg-white hover:border-black',
              )}
            >
              {option}
            </button>
          ))}
        </div>
        {showError && (
          <p className="mt-3 text-sm font-medium text-red-650" role="alert">
            Choose a size before continuing.
          </p>
        )}

        <div className="mt-8 space-y-2 border-y border-black/10 py-5 text-sm text-black/65">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4" /> Inspected and verified before sale
          </div>
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-4 w-4" /> Estimated delivery shown at checkout
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => add(false)}
            className="h-13 rounded-full border border-black px-5 text-xs font-bold uppercase tracking-[0.14em] transition hover:bg-black hover:text-white"
          >
            Add to bag
          </button>
          <button
            type="button"
            onClick={() => add(true)}
            className="h-13 rounded-full bg-black px-5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-acid hover:text-black"
          >
            Buy now
          </button>
        </div>
        <button
          type="button"
          onClick={closeQuickBuy}
          className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-black/45 underline-offset-4 hover:underline"
        >
          Continue shopping
        </button>
      </div>
    </div>
  );
}

function QuickBuy() {
  const { quickBuyProduct, closeQuickBuy } = useCommerce();
  return (
    <DialogShell
      open={Boolean(quickBuyProduct)}
      onClose={closeQuickBuy}
      title="Quick buy"
      wide
    >
      {quickBuyProduct && (
        <QuickBuyContent key={quickBuyProduct.id} product={quickBuyProduct} />
      )}
    </DialogShell>
  );
}

type CartAvailability = {
  listingId: string;
  status: 'available' | 'price_changed' | 'unavailable';
  currentPrice?: number;
};

async function validateCart(cart: CartLine[]): Promise<CartAvailability[]> {
  const response = await fetch('/api/cart/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: cart.map((line) => ({
      listingId: line.listingId,
      size: line.size,
      displayedPrice: line.product.price,
    })) }),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(result?.items)) {
    throw new Error(result?.error || 'We could not check this bag right now.');
  }
  return result.items as CartAvailability[];
}

function CartDrawer() {
  const {
    cart,
    cartOpen,
    closeCart,
    subtotal,
    removeFromCart,
    openCheckout,
    cartCount,
  } = useCommerce();
  const [availability, setAvailability] = useState<Record<string, CartAvailability>>({});
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');

  useEffect(() => {
    if (!cartOpen || cart.length === 0) return;
    let active = true;
    setChecking(true);
    validateCart(cart)
      .then((items) => {
        if (active) {
          setAvailability(Object.fromEntries(items.map((item) => [item.listingId, item])));
          setCheckError('');
        }
      })
      .catch((error) => {
        if (active) setCheckError(error instanceof Error ? error.message : 'Availability could not be checked.');
      })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [cartOpen, cart]);

  const handleCheckout = async () => {
    setChecking(true);
    try {
      const items = await validateCart(cart);
      const byId = Object.fromEntries(items.map((item) => [item.listingId, item]));
      setAvailability(byId);
      setCheckError('');
      if (items.every((item) => item.status === 'available')) openCheckout();
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : 'Availability could not be checked.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <DialogShell open={cartOpen} onClose={closeCart} title={`Your bag · ${cartCount}`}>
      <div className="flex min-h-[calc(100dvh-73px)] flex-col px-5 py-6 md:px-7">
        {cart.length === 0 ? (
          <div className="m-auto max-w-xs text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-black text-white">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-2xl font-black tracking-[-0.04em]">Your bag is empty.</h2>
            <p className="mt-2 text-sm leading-6 text-black/55">
              Find a verified piece and use Quick Buy to add it here.
            </p>
            <button
              type="button"
              onClick={closeCart}
              className="mt-6 h-12 rounded-full bg-black px-7 text-xs font-bold uppercase tracking-[0.14em] text-white"
            >
              Shop most wanted
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {cart.map((line) => (
                <article
                  key={`${line.product.id}-${line.size}`}
                  className="grid grid-cols-[92px_1fr] gap-4 border-b border-black/10 pb-5"
                >
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#ece9e1]">
                    <Image
                      src={line.product.image}
                      alt=""
                      fill
                      sizes="92px"
                      className="object-cover"
                      style={{ objectPosition: line.product.imagePosition }}
                    />
                  </div>
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/45">
                          {line.product.brand}
                        </p>
                        <h3 className="mt-1 font-bold leading-tight">{line.product.name}</h3>
                        <p className="mt-1 text-xs text-black/50">
                          {line.size} · {line.product.condition}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.product.id, line.size)}
                        className="text-black/35 transition hover:text-black"
                        aria-label={`Remove ${line.product.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-black/45">One-of-one · Qty 1</span>
                      <p className="font-bold">
                        {formatPrice(line.product.price * line.quantity, 'MZN')}
                      </p>
                    </div>
                    {availability[line.listingId]?.status === 'unavailable' && <p className="mt-2 text-xs font-semibold text-red-700">This item is no longer available. Please remove it.</p>}
                    {availability[line.listingId]?.status === 'price_changed' && <p className="mt-2 text-xs font-semibold text-red-700">The price changed to {formatPrice(availability[line.listingId].currentPrice ?? 0, 'MZN')}. Remove and add it again to review the new price.</p>}
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-auto border-t border-black/10 pt-6">
              <div className="flex items-center justify-between text-sm text-black/55">
                <span>Shipping</span>
                <span>Calculated at checkout</span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-sm font-semibold uppercase tracking-[0.12em]">Subtotal</span>
                <span className="text-2xl font-black">{formatPrice(subtotal, 'MZN')}</span>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={checking}
                className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-black text-xs font-bold uppercase tracking-[0.15em] text-white transition hover:bg-acid hover:text-black disabled:opacity-50"
              >
                {checking ? 'Checking bag' : 'Checkout'} <ArrowRight className="h-4 w-4" />
              </button>
              {checkError && <p className="mt-3 text-center text-xs text-red-700" role="alert">{checkError}</p>}
              <p className="mt-3 flex items-center justify-center gap-2 text-[11px] text-black/45">
                <LockKeyhole className="h-3 w-3" /> Secure checkout · Buyer protection
              </p>
            </div>
          </>
        )}
      </div>
    </DialogShell>
  );
}

type CheckoutStep = 'contact' | 'delivery' | 'payment' | 'review' | 'confirmation';
type PaymentState = 'idle' | 'waiting' | 'processing' | 'timedOut' | 'paid' | 'paidNeedsHelp' | 'failed';

type ShippingMethod = {
  code: string;
  name: string;
  price: number;
  currency: string;
  estimated_min_days: number;
  estimated_max_days: number;
};

const checkoutSteps: CheckoutStep[] = ['contact', 'delivery', 'payment', 'review'];

function CheckoutSheet() {
  const { cart, subtotal, checkoutOpen, closeCheckout, clearCart } = useCommerce();
  const [step, setStep] = useState<CheckoutStep>('contact');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'card'>('mpesa');
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [city, setCity] = useState('Maputo');
  const [province, setProvince] = useState('Maputo');
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingMethodCode, setShippingMethodCode] = useState('');
  const [shippingLoading, setShippingLoading] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [checkoutAttemptId, setCheckoutAttemptId] = useState('');
  const [checkoutSecret, setCheckoutSecret] = useState('');
  const [orderId, setOrderId] = useState('');
  const [confirmedTotal, setConfirmedTotal] = useState<number | null>(null);
  const squareEnabled = process.env.NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED === 'true';
  const mpesaEnabled = process.env.NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED === 'true';
  const selectedShipping = shippingMethods.find((method) => method.code === shippingMethodCode);
  const shipping = selectedShipping?.price ?? 0;
  const total = subtotal + shipping;

  useEffect(() => {
    if (!checkoutOpen || !province.trim()) return;
    let active = true;
    setShippingLoading(true);
    fetch('/api/checkout/shipping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'MZ', province: province.trim() }),
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || 'Delivery options are unavailable.');
        return result.methods as ShippingMethod[];
      })
      .then((methods) => {
        if (!active) return;
        setShippingMethods(methods);
        setShippingMethodCode((current) => methods.some((method) => method.code === current) ? current : methods[0]?.code ?? '');
      })
      .catch(() => {
        if (active) {
          setShippingMethods([]);
          setShippingMethodCode('');
        }
      })
      .finally(() => { if (active) setShippingLoading(false); });
    return () => { active = false; };
  }, [checkoutOpen, province]);

  const index = checkoutSteps.indexOf(step);
  const next = () => {
    setError('');
    if (
      step === 'contact' &&
      (!name.trim() || !email.includes('@') || !/^(84|85)\d{7}$/.test(phone.replace(/\D/g, '')))
    ) {
      setError('Add your name, email and a valid phone number.');
      return;
    }
    if (step === 'delivery' && (!address.trim() || !city.trim() || !province.trim() || !selectedShipping)) {
      setError('Add a complete delivery address.');
      return;
    }
    if (step === 'payment') setStep('review');
    else if (step === 'contact') setStep('delivery');
    else if (step === 'delivery') setStep('payment');
  };

  const back = () => {
    if (step === 'review') setStep('payment');
    else if (step === 'payment') setStep('delivery');
    else if (step === 'delivery') setStep('contact');
  };

  const pay = async () => {
    setError('');
    if (paymentMethod === 'card' && !squareEnabled) {
      setError('Card payment is not enabled for this store. Choose M-Pesa.');
      return;
    }
    if (paymentMethod !== 'mpesa' || !mpesaEnabled) {
      setPaymentState('failed');
      setError('M-Pesa is not active for this store. No payment request was sent.');
      return;
    }
    if (!/^(84|85)\d{7}$/.test(phone.replace(/\D/g, ''))) {
      setError('Enter the M-Pesa number that should receive the payment request.');
      return;
    }
    if (!selectedShipping) {
      setError('Choose an available delivery method before paying.');
      return;
    }
    if (!cart.length || cart.some((line) => !line.listingId)) {
      setPaymentState('failed');
      setError('These are preview products, not live inventory. No payment request was sent.');
      return;
    }
    if (cart.some((line) => line.quantity !== 1)) {
      setPaymentState('failed');
      setError('Each live listing is a one-off item. Set each item to quantity one to continue.');
      return;
    }

    setPaymentState('processing');
    try {
      let activeOrderId = orderId;
      if (!activeOrderId) {
        const attemptId = checkoutAttemptId || globalThis.crypto.randomUUID();
        const secret = checkoutSecret || globalThis.crypto.randomUUID();
        setCheckoutAttemptId(attemptId);
        setCheckoutSecret(secret);
        const orderResponse = await fetch('/api/checkout/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkout_id: attemptId,
            checkout_secret: secret,
            name,
            email,
            phone: phone.replace(/\D/g, ''),
            address_line_1: address,
            address_line_2: addressLine2,
            postal_code: postalCode,
            delivery_notes: deliveryNotes,
            city,
            province,
            country: 'MZ',
            shipping_method_code: selectedShipping.code,
            items: cart.map((line) => ({
              listingId: line.listingId,
              size: line.size,
              quantity: line.quantity,
              displayedPrice: line.product.price,
            })),
          }),
        });
        const orderResult = await orderResponse.json().catch(() => null);
        if (!orderResponse.ok) throw new Error(orderResult?.error || 'Could not reserve this order.');
        activeOrderId = orderResult.orderId;
        setOrderId(activeOrderId);
        setOrderNumber(orderResult.orderNumber);
        setConfirmedTotal(Number(orderResult.total));
      }

      const initiateResponse = await fetch('/api/payments/mpesa/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: activeOrderId,
          phone: phone.replace(/\D/g, ''),
        }),
      });
      const initiation = await initiateResponse.json().catch(() => null);
      if (initiation?.status === 'FAILED') {
        setPaymentState('failed');
        setError(initiation.message || 'The M-Pesa request could not be started.');
        setCheckoutAttemptId('');
        setCheckoutSecret('');
        setOrderId('');
        return;
      }
      if (!initiateResponse.ok) throw new Error(initiation?.error || 'Could not start the M-Pesa request.');

      if (initiation.orderNumber) setOrderNumber(initiation.orderNumber);
      setPaymentState('waiting');

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const statusResponse = await fetch(`/api/payments/${initiation.paymentId}/status?orderId=${activeOrderId}`, { cache: 'no-store' });
        const status = await statusResponse.json().catch(() => null);
        if (status?.status === 'PAID') {
          setOrderNumber(status.orderNumber || orderNumber);
          setPaymentState(status.fulfillable ? 'paid' : 'paidNeedsHelp');
          setStep('confirmation');
          return;
        }
        if (status?.status === 'FAILED' || status?.status === 'CANCELLED') {
          setPaymentState('failed');
          setError('The M-Pesa request was not completed. You can try again; no order was marked paid.');
          setCheckoutAttemptId('');
          setCheckoutSecret('');
          setOrderId('');
          return;
        }
        if (!statusResponse.ok && statusResponse.status !== 202) {
          throw new Error(status?.error || 'We could not check the payment status yet.');
        }
        if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      setPaymentState('timedOut');
      setError('Still waiting for payment confirmation. Check again; no second payment request will be sent.');
    } catch (paymentError) {
      setPaymentState('failed');
      setError(paymentError instanceof Error ? paymentError.message : 'M-Pesa checkout is temporarily unavailable.');
    }
  };

  const close = () => {
    if (step === 'confirmation') {
      clearCart();
      setCheckoutAttemptId('');
      setCheckoutSecret('');
      setOrderId('');
      setOrderNumber('');
      setConfirmedTotal(null);
      setPaymentState('idle');
      setStep('contact');
    }
    closeCheckout();
  };

  return (
    <DialogShell open={checkoutOpen} onClose={close} title="Secure checkout">
      <div className="min-h-[calc(100dvh-73px)] px-5 py-6 md:px-8 md:py-8">
        {step !== 'confirmation' && (
          <>
            <div className="flex items-center gap-2" aria-label="Checkout progress">
              {checkoutSteps.map((item, itemIndex) => (
                <React.Fragment key={item}>
                  <span
                    className={cn(
                      'grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold uppercase',
                      itemIndex <= index ? 'bg-black text-white' : 'bg-black/8 text-black/35',
                    )}
                  >
                    {itemIndex < index ? <Check className="h-3 w-3" /> : itemIndex + 1}
                  </span>
                  {itemIndex < checkoutSteps.length - 1 && (
                    <span className="h-px flex-1 bg-black/10" />
                  )}
                </React.Fragment>
              ))}
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-black/40">
              {step} · Step {index + 1} of 4
            </p>
          </>
        )}

        {step === 'contact' && (
          <div className="mt-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-black/45">Guest checkout</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Where can we reach you?</h2>
            <p className="mt-2 text-sm leading-6 text-black/55">No account required. We’ll send order updates here.</p>
            <div className="mt-7 space-y-4">
              <Field label="Full name" value={name} onChange={setName} autoComplete="name" />
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field label="Phone" value={phone} onChange={setPhone} prefix="+258" placeholder="84 XXX XXXX" autoComplete="tel" />
            </div>
          </div>
        )}

        {step === 'delivery' && (
          <div className="mt-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-black/45">Delivery</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Where should it go?</h2>
            <div className="mt-7 space-y-4">
              <Field label="Address line 1" value={address} onChange={setAddress} autoComplete="address-line1" />
              <Field label="Address line 2 (optional)" value={addressLine2} onChange={setAddressLine2} autoComplete="address-line2" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City" value={city} onChange={setCity} autoComplete="address-level2" />
                <Field label="Province" value={province} onChange={setProvince} autoComplete="address-level1" />
              </div>
              <Field label="Postal code (optional)" value={postalCode} onChange={setPostalCode} autoComplete="postal-code" />
              <Field label="Delivery notes (optional)" value={deliveryNotes} onChange={setDeliveryNotes} />
              <p className="text-xs text-black/50">Country: Mozambique</p>
              <fieldset>
                <legend className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-black/55">Delivery method</legend>
                {shippingLoading && <p className="text-sm text-black/50">Checking delivery options…</p>}
                {!shippingLoading && shippingMethods.length === 0 && <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">No delivery method is currently available for this province.</p>}
                <div className="space-y-2">
                  {shippingMethods.map((method) => <label key={method.code} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 bg-white p-4 ${shippingMethodCode === method.code ? 'border-black' : 'border-black/10'}`}>
                    <span className="flex items-center gap-3">
                      <input type="radio" name="shipping-method" value={method.code} checked={shippingMethodCode === method.code} onChange={() => setShippingMethodCode(method.code)} />
                      <span><strong className="block text-sm">{method.name}</strong><span className="text-xs text-black/50">Estimated {method.estimated_min_days}–{method.estimated_max_days} business days</span></span>
                    </span>
                    <strong className="text-sm">{formatPrice(method.price, 'MZN')}</strong>
                  </label>)}
                </div>
              </fieldset>
            </div>
          </div>
        )}

        {step === 'payment' && (
          <div className="mt-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-black/45">Express checkout</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Choose how to pay.</h2>
            <div className="mt-7 space-y-3">
              <PaymentOption
                selected={paymentMethod === 'mpesa'}
                onClick={() => setPaymentMethod('mpesa')}
                icon={<Smartphone className="h-5 w-5" />}
                title="M-Pesa"
                detail="Primary payment method in Mozambique"
              />
              {squareEnabled && (
                <PaymentOption
                  selected={paymentMethod === 'card'}
                  onClick={() => setPaymentMethod('card')}
                  icon={<LockKeyhole className="h-5 w-5" />}
                  title="Card"
                  detail="Secure international card payment"
                />
              )}
            </div>
            {paymentMethod === 'mpesa' && (
              <div className="mt-5 rounded-2xl bg-[#efede5] p-5">
                <p className="text-sm font-bold">M-Pesa phone number</p>
                <p className="mt-1 text-xs leading-5 text-black/50">We’ll send an M-Pesa prompt to this number. Confirm it on your phone with your M-Pesa PIN.</p>
                <div className="mt-4">
                  <Field value={phone} onChange={setPhone} prefix="+258" placeholder="84 XXX XXXX" autoComplete="tel" />
                </div>
              </div>
            )}
            {!mpesaEnabled && paymentMethod === 'mpesa' && (
              <p className="mt-4 rounded-xl border border-black/10 bg-white p-3 text-xs leading-5 text-black/55">
                M-Pesa checkout is not active on this deployment yet. No payment request will be sent.
              </p>
            )}
            {!squareEnabled && (
              <p className="mt-5 text-xs leading-5 text-black/45">International card payment will appear only when a supported merchant gateway is configured.</p>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="mt-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-black/45">Review</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Ready when you are.</h2>
            <div className="mt-7 space-y-4">
              {cart.map((line) => (
                <div key={`${line.product.id}-${line.size}`} className="flex items-center gap-4 border-b border-black/10 pb-4">
                  <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-[#ece9e1]">
                    <Image src={line.product.image} alt="" fill sizes="64px" className="object-cover" style={{ objectPosition: line.product.imagePosition }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{line.product.name}</p>
                    <p className="text-xs text-black/45">{line.size} · Qty {line.quantity}</p>
                  </div>
                  <p className="text-sm font-bold">{formatPrice(line.product.price * line.quantity, 'MZN')}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between text-black/55"><span>Subtotal</span><span>{formatPrice(subtotal, 'MZN')}</span></div>
              <div className="flex justify-between text-black/55"><span>Delivery</span><span>{formatPrice(shipping, 'MZN')}</span></div>
              <p className="text-xs text-black/45">{selectedShipping?.name ?? 'Choose delivery method'} · {address}, {city}, {province}</p>
              <div className="flex justify-between border-t border-black/10 pt-3 text-lg font-black"><span>Total</span><span>{formatPrice(total, 'MZN')}</span></div>
            </div>
            {['waiting', 'processing'].includes(paymentState) && (
              <div className="mt-6 rounded-2xl border border-acid bg-acid/20 p-5 text-center" role="status" aria-live="polite">
                <LoaderCircle className="mx-auto h-6 w-6 animate-spin" />
                <p className="mt-3 text-sm font-black uppercase tracking-[0.12em]">
                  {paymentState === 'waiting' ? 'Check your phone' : 'Preparing your request'}
                </p>
                <p className="mt-1 text-xs text-black/55">Approve the M-Pesa request on your device.</p>
              </div>
            )}
            {paymentState === 'timedOut' && <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-sm text-amber-900" role="status">Confirmation is taking longer than expected. You can check again without sending another request to your phone.</p>}
          </div>
        )}

        {step === 'confirmation' && (
          <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-acid">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-black/45">
              {paymentState === 'paidNeedsHelp' ? 'Payment received · order needs review' : 'Payment received'}
            </p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.06em]">
              {paymentState === 'paidNeedsHelp' ? 'We’re reviewing your order.' : 'Order confirmed.'}
            </h2>
            <p className="mt-3 text-sm text-black/55">Order {orderNumber}</p>
            {paymentState === 'paidNeedsHelp' && (
              <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
                Your payment is confirmed, but the item reservation expired before we could confirm fulfillment. Contact support with this order number.
              </p>
            )}
            <div className="mt-7 w-full rounded-3xl bg-[#efede5] p-5 text-left text-sm">
              {cart.map((line) => <div key={line.listingId} className="mb-3 flex justify-between gap-4 border-b border-black/10 pb-3"><span>{line.product.name} · {line.size}</span><strong>{formatPrice(line.product.price, 'MZN')}</strong></div>)}
              <div className="flex justify-between"><span className="text-black/50">Amount paid</span><strong>{formatPrice(confirmedTotal ?? total, 'MZN')}</strong></div>
              <div className="mt-3 flex justify-between"><span className="text-black/50">Payment</span><strong>{paymentMethod === 'mpesa' ? 'M-Pesa' : 'Card'}</strong></div>
              <div className="mt-3 flex justify-between gap-4"><span className="text-black/50">Delivery</span><strong className="text-right">{selectedShipping?.name} · {address}, {city}, {province}</strong></div>
            </div>
            <p className="mt-4 text-xs text-black/50">Next: we’ll prepare your verified piece and update your order timeline.</p>
            <button type="button" onClick={close} className="mt-7 h-13 w-full rounded-full bg-black text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-acid hover:text-black">Continue shopping</button>
            <Link href={`/order/${orderNumber}`} className="mt-4 text-xs font-bold uppercase tracking-[0.12em] underline underline-offset-4">Track order</Link>
          </div>
        )}

        {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700" role="alert">{error}</p>}

        {!['review', 'confirmation'].includes(step) && (
          <div className="mt-8 flex items-center gap-3">
            {step !== 'contact' && <button type="button" onClick={back} className="grid h-13 w-13 shrink-0 place-items-center rounded-full border border-black/15 bg-white" aria-label="Previous checkout step"><ArrowLeft className="h-4 w-4" /></button>}
            <button type="button" onClick={next} className="flex h-13 flex-1 items-center justify-center gap-2 rounded-full bg-black text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-acid hover:text-black">Continue <ArrowRight className="h-4 w-4" /></button>
          </div>
        )}
        {step === 'review' && (
          <div className="mt-7 flex items-center gap-3">
            <button type="button" onClick={back} disabled={paymentState === 'waiting' || paymentState === 'processing'} className="grid h-13 w-13 shrink-0 place-items-center rounded-full border border-black/15 bg-white disabled:opacity-40" aria-label="Previous checkout step"><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" onClick={pay} disabled={paymentState === 'waiting' || paymentState === 'processing'} className="flex h-13 flex-1 items-center justify-center gap-2 rounded-full bg-black text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-acid hover:text-black disabled:opacity-50">{paymentState === 'waiting' || paymentState === 'processing' ? 'Waiting for approval' : paymentState === 'timedOut' ? 'Check payment status' : paymentMethod === 'mpesa' ? 'Continue with M-Pesa' : 'Pay securely'}</button>
          </div>
        )}
      </div>
    </DialogShell>
  );
}

function Field({
  label,
  value,
  onChange,
  prefix,
  type = 'text',
  placeholder,
  autoComplete,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      {label && <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-black/55">{label}</span>}
      <span className="flex h-13 items-center rounded-2xl border border-black/15 bg-white px-4 focus-within:border-black focus-within:ring-2 focus-within:ring-acid/70">
        {prefix && <span className="mr-2 border-r border-black/10 pr-2 text-sm font-bold">{prefix}</span>}
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/30" />
      </span>
    </label>
  );
}

function PaymentOption({ selected, onClick, icon, title, detail }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={cn('flex w-full items-center gap-4 rounded-2xl border-2 bg-white p-4 text-left transition', selected ? 'border-black' : 'border-transparent hover:border-black/15')}>
      <span className={cn('grid h-11 w-11 place-items-center rounded-full', selected ? 'bg-acid' : 'bg-black/5')}>{icon}</span>
      <span className="flex-1"><strong className="block text-sm">{title}</strong><span className="text-xs text-black/50">{detail}</span></span>
      <span className={cn('grid h-5 w-5 place-items-center rounded-full border', selected ? 'border-black bg-black text-white' : 'border-black/20')}>{selected && <Check className="h-3 w-3" />}</span>
    </button>
  );
}

function StickyBag() {
  const { cartCount, subtotal, openCart, openCheckout } = useCommerce();
  if (cartCount === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center rounded-full border border-white/20 bg-black/90 p-1.5 pl-5 text-white shadow-2xl backdrop-blur-xl md:bottom-6">
      <button type="button" onClick={openCart} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ShoppingBag className="h-4 w-4 text-acid" />
        <span className="text-xs font-bold uppercase tracking-[0.12em]">Bag · {cartCount}</span>
        <span className="truncate text-xs text-white/60">{formatPrice(subtotal, 'MZN')}</span>
      </button>
      <button type="button" onClick={openCheckout} className="h-11 rounded-full bg-acid px-5 text-[11px] font-black uppercase tracking-[0.13em] text-black">Checkout</button>
    </div>
  );
}

export function CommerceOverlays() {
  return (
    <>
      <QuickBuy />
      <CartDrawer />
      <CheckoutSheet />
      <StickyBag />
    </>
  );
}
