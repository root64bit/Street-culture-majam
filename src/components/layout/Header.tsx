'use client';

import React from 'react';
import Link from 'next/link';
import { Search, Heart, ShoppingBag, User } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-vault-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex flex-col group">
          <span className="text-lg font-black tracking-widest text-white uppercase group-hover:text-acid transition-colors">
            STREET CULTURE
          </span>
          <span className="text-[9px] font-mono tracking-[0.25em] text-neutral-400 uppercase -mt-1">
            ARCHIVAL VAULT
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden lg:flex items-center gap-7 text-[12px] font-mono uppercase tracking-wider text-neutral-300">
          <Link href="/new" className="hover:text-white transition-colors">
            NEW IN
          </Link>
          <Link href="/sneakers" className="hover:text-white transition-colors">
            SNEAKERS
          </Link>
          <Link href="/streetwear" className="hover:text-white transition-colors">
            STREETWEAR
          </Link>
          <Link href="/luxury" className="hover:text-white transition-colors">
            LUXURY
          </Link>
          <Link href="/accessories" className="hover:text-white transition-colors">
            ACCESSORIES
          </Link>
          <Link href="/brands" className="hover:text-white transition-colors">
            BRANDS
          </Link>
          <Link
            href="/consign"
            className="flex items-center gap-1.5 text-acid font-semibold hover:text-acid-hover transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" />
            CONSIGN
          </Link>
          <Link href="/search" className="hover:text-white transition-colors">
            DROPS
          </Link>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-4">
          {/* Command + K Search bar */}
          <Link
            href="/search"
            className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-mono text-neutral-400 hover:border-white/20 hover:text-neutral-200 transition-all"
          >
            <Search className="h-3.5 w-3.5 text-neutral-400" />
            <span>COMMAND + K</span>
          </Link>

          {/* Wishlist */}
          <Link
            href="/account/wishlist"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-300 hover:border-white/20 hover:text-white transition-all"
            aria-label="Wishlist"
          >
            <Heart className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-acid text-[10px] font-bold text-black font-mono">
              3
            </span>
          </Link>

          {/* Cart */}
          <Link
            href="/account"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-300 hover:border-white/20 hover:text-white transition-all"
            aria-label="Cart"
          >
            <ShoppingBag className="h-4 w-4" />
          </Link>

          {/* Account / Sign In */}
          <Link
            href="/auth/sign-in"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-300 hover:border-white/20 hover:text-white transition-all"
            aria-label="User Account"
          >
            <User className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
