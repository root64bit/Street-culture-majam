import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { businessDetails, supportDetails, whatsappHref } from '@/lib/storefront/business';

export function Footer() {
  return (
    <footer className="w-full border-t border-white/10 bg-vault-950 py-16 text-neutral-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand Manifesto */}
          <div className="col-span-1 lg:col-span-2">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-3"
              aria-label="Street Culture home"
            >
              <Image
                src="/brand/street-culture-icon.png"
                alt=""
                width={52}
                height={55}
                className="h-12 w-auto"
              />
              <span className="text-sm font-black tracking-[0.08em] text-white">
                STREET CULTURE
                <span className="mt-1 block text-[9px] font-semibold tracking-[0.25em] text-white/55">
                  AUTHENTIC ONLY
                </span>
              </span>
            </Link>
            <p className="max-w-md font-sans text-xs leading-relaxed text-neutral-400">
              Curated sneakers, streetwear and luxury. Every piece is inspected before it is
              approved for sale.
            </p>
            <p className="mt-4 max-w-md font-mono text-[10px] uppercase leading-5 tracking-[0.1em] text-white/45">
              Trading as Street Culture · {businessDetails.operatingLocation}
            </p>
          </div>

          {/* Catalog links */}
          <div>
            <h4 className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-white">
              COLLECTIONS
            </h4>
            <ul className="space-y-2 font-mono text-xs">
              <li>
                <Link href="/shop" className="transition-colors hover:text-acid">
                  All Products
                </Link>
              </li>
              <li>
                <Link href="/sneakers" className="transition-colors hover:text-acid">
                  Sneakers
                </Link>
              </li>
              <li>
                <Link href="/streetwear" className="transition-colors hover:text-acid">
                  Streetwear
                </Link>
              </li>
              <li>
                <Link href="/luxury" className="transition-colors hover:text-acid">
                  Luxury Fashion
                </Link>
              </li>
              <li>
                <Link href="/accessories" className="transition-colors hover:text-acid">
                  Accessories
                </Link>
              </li>
              <li>
                <Link href="/brands" className="transition-colors hover:text-acid">
                  Brands Index
                </Link>
              </li>
            </ul>
          </div>

          {/* Marketplace & Consignment */}
          <div>
            <h4 className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-white">
              SERVICES
            </h4>
            <ul className="space-y-2 font-mono text-xs">
              <li>
                <Link href="/consign" className="transition-colors hover:text-acid">
                  Consign An Item
                </Link>
              </li>
              <li>
                <Link href="/consign/new" className="transition-colors hover:text-acid">
                  Intake Protocol
                </Link>
              </li>
              <li>
                <Link href="/account" className="transition-colors hover:text-acid">
                  Consignor Portal
                </Link>
              </li>
              <li>
                <Link href="/consignment-terms" className="transition-colors hover:text-acid">
                  Seller Agreement
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-white">
              HELP &amp; LEGAL
            </h4>
            <ul className="space-y-2 font-mono text-xs">
              <li>
                <Link href="/about" className="transition-colors hover:text-acid">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition-colors hover:text-acid">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/shipping" className="transition-colors hover:text-acid">
                  Shipping &amp; Delivery
                </Link>
              </li>
              <li>
                <Link href="/returns" className="transition-colors hover:text-acid">
                  Returns &amp; Refunds
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition-colors hover:text-acid">
                  Privacy &amp; POPIA
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition-colors hover:text-acid">
                  Terms &amp; Conditions
                </Link>
              </li>
              {supportDetails.email && (
                <li>
                  <a
                    href={`mailto:${supportDetails.email}`}
                    className="transition-colors hover:text-acid"
                  >
                    {supportDetails.email}
                  </a>
                </li>
              )}
              {supportDetails.phone && (
                <li>
                  <a
                    href={`tel:${supportDetails.phone}`}
                    className="transition-colors hover:text-acid"
                  >
                    {supportDetails.phone}
                  </a>
                </li>
              )}
              {supportDetails.whatsapp && (
                <li>
                  <a
                    href={whatsappHref() || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-acid"
                  >
                    WhatsApp support
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between border-t border-white/5 pt-8 font-mono text-[11px] text-neutral-500 sm:flex-row">
          <div>© {new Date().getFullYear()} STREET CULTURE. ALL RIGHTS RESERVED.</div>
          <div className="mt-4 flex gap-6 sm:mt-0">
            <span>STRICT AUTHENTICITY GUARANTEE</span>
            <span>ORDER STATUS TRACKING</span>
          </div>
        </div>
        <p className="mt-4 text-[10px] text-neutral-500">
          Payments are charged in {businessDetails.checkoutCurrency}. EUR/ZAR displays are
          estimates.{' '}
          <a
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
          >
            Rates By Exchange Rate API
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
