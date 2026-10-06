'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { useCommerce } from '@/features/commerce/CommerceProvider';
import { useDisplayCurrency } from '@/features/currency/CurrencyProvider';

const navigation = [
  { label: 'NEW', href: '/#new' },
  { label: 'SNEAKERS', href: '/#sneakers' },
  { label: 'STREETWEAR', href: '/#streetwear' },
  { label: 'LUXURY', href: '/#luxury' },
  { label: 'ACCESSORIES', href: '/#accessories' },
  { label: 'BRANDS', href: '/brands' },
  { label: 'SELL', href: '/#sell' },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, openCart } = useCommerce();
  const { currency, rates, updatedAt, chooseCurrency } = useDisplayCurrency();

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between rounded-2xl border border-white/35 bg-white/78 px-4 text-black shadow-[0_12px_50px_rgba(0,0,0,0.08)] backdrop-blur-2xl sm:px-6">
        <Link href="/" className="group shrink-0" aria-label="Street Culture home">
          <Image
            src="/brand/street-culture-horizontal.png"
            alt="Street Culture — Authentic Only"
            width={796}
            height={186}
            priority
            className="h-8 w-auto sm:h-10 lg:h-11"
          />
        </Link>

        <nav className="hidden items-center gap-5 xl:flex" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.label} href={item.href} className="text-[11px] font-bold tracking-[0.12em] text-black/65 transition hover:text-black">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <label className="sr-only" htmlFor="display-currency">Display currency</label>
          <select id="display-currency" value={currency} onChange={(event) => chooseCurrency(event.target.value as 'MZN' | 'EUR' | 'ZAR')}
            aria-label="Display currency" title={updatedAt ? `Estimated rates updated ${new Date(updatedAt).toLocaleDateString()}; checkout charges MZN` : 'Checkout charges MZN'}
            className="max-w-[74px] rounded-lg border border-black/10 bg-transparent px-1 py-2 text-[10px] font-bold text-black sm:max-w-none">
            <option value="MZN">MZN</option><option value="EUR" disabled={!rates.EUR}>EUR</option><option value="ZAR" disabled={!rates.ZAR}>ZAR</option>
          </select>
          <Link href="/search" className="header-action" aria-label="Search">
            <Search className="h-4 w-4" />
            <span className="hidden text-[10px] font-bold tracking-[0.12em] lg:inline">SEARCH</span>
          </Link>
          <Link href="/account" className="header-action hidden sm:flex" aria-label="Account"><User className="h-4 w-4" /></Link>
          <Link href="/account/wishlist" className="header-action hidden sm:flex" aria-label="Wishlist"><Heart className="h-4 w-4" /></Link>
          <button type="button" onClick={openCart} className="header-action relative" aria-label={`Bag with ${cartCount} items`}>
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden text-[10px] font-bold tracking-[0.12em] lg:inline">BAG</span>
            {cartCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-acid px-1 text-[10px] font-black">{cartCount}</span>}
          </button>
          <button type="button" onClick={() => setMenuOpen((value) => !value)} className="header-action xl:hidden" aria-expanded={menuOpen} aria-label="Toggle menu">
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="mx-auto mt-2 max-w-[1500px] rounded-2xl border border-white/35 bg-white/95 p-3 text-black shadow-xl backdrop-blur-2xl xl:hidden" aria-label="Mobile navigation">
          <div className="grid grid-cols-2 gap-1">
            {navigation.map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 text-xs font-bold tracking-[0.12em] hover:bg-black hover:text-white">{item.label}</Link>
            ))}
            <Link href="/account" onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 text-xs font-bold tracking-[0.12em] hover:bg-black hover:text-white">ACCOUNT</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
