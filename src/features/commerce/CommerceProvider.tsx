'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { StoreProduct } from '@/data/storefront';

export interface CartLine {
  listingId: string;
  product: StoreProduct;
  size: string;
  quantity: number;
}

interface CommerceContextValue {
  cart: CartLine[];
  cartCount: number;
  subtotal: number;
  quickBuyProduct: StoreProduct | null;
  cartOpen: boolean;
  checkoutOpen: boolean;
  openQuickBuy: (product: StoreProduct) => void;
  closeQuickBuy: () => void;
  openCart: () => void;
  closeCart: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  addToCart: (product: StoreProduct, size: string, buyNow?: boolean) => void;
  removeFromCart: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  clearCart: () => void;
}

const CommerceContext = createContext<CommerceContextValue | null>(null);

export function CommerceProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [quickBuyProduct, setQuickBuyProduct] = useState<StoreProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sc_cart_v1') ?? '[]') as unknown;
      if (Array.isArray(saved)) {
        setCart(saved.filter((line): line is CartLine =>
          Boolean(
            line && typeof line === 'object' &&
            typeof line.listingId === 'string' &&
            typeof line.size === 'string' &&
            line.quantity === 1 &&
            line.product && typeof line.product === 'object' &&
            line.product.listingId === line.listingId &&
            typeof line.product.price === 'number',
          ),
        ));
      }
    } catch {
      // A corrupted browser snapshot is discarded; server checkout still
      // verifies every listing and price against the database.
    } finally {
      setCartHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (cartHydrated) localStorage.setItem('sc_cart_v1', JSON.stringify(cart));
  }, [cart, cartHydrated]);

  const value = useMemo<CommerceContextValue>(() => {
    const addToCart = (product: StoreProduct, size: string, buyNow = false) => {
      if (!product.listingId || !product.sizes.includes(size)) return;
      setCart((current) => {
        if (current.some((line) => line.listingId === product.listingId)) return current;
        return [...current, { listingId: product.listingId!, product, size, quantity: 1 }];
      });
      setQuickBuyProduct(null);
      if (buyNow) {
        setCheckoutOpen(true);
      } else {
        setCartOpen(true);
      }
    };

    return {
      cart,
      cartCount: cart.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
      quickBuyProduct,
      cartOpen,
      checkoutOpen,
      openQuickBuy: setQuickBuyProduct,
      closeQuickBuy: () => setQuickBuyProduct(null),
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      openCheckout: () => {
        setCartOpen(false);
        setCheckoutOpen(true);
      },
      closeCheckout: () => setCheckoutOpen(false),
      addToCart,
      removeFromCart: (productId, size) =>
        setCart((current) =>
          current.filter((line) => !(line.product.id === productId && line.size === size)),
        ),
      updateQuantity: (productId, size, quantity) =>
        setCart((current) =>
          current.map((line) =>
            line.product.id === productId && line.size === size
              ? { ...line, quantity: Math.min(1, Math.max(1, quantity)) }
              : line,
          ),
        ),
      clearCart: () => setCart([]),
    };
  }, [cart, quickBuyProduct, cartOpen, checkoutOpen]);

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const context = useContext(CommerceContext);
  if (!context) {
    throw new Error('useCommerce must be used within CommerceProvider');
  }
  return context;
}
