import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="w-full border-t border-white/10 bg-vault-950 py-16 text-neutral-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand Manifesto */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex flex-col mb-4">
              <span className="text-xl font-black tracking-widest text-white uppercase">
                STREET CULTURE
              </span>
              <span className="text-[10px] font-mono tracking-[0.25em] text-acid uppercase">
                ARCHIVAL VAULT & CONSIGNMENT
              </span>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-neutral-400 font-sans">
              The premier authenticated resale and consignment marketplace for archival sneakers,
              high streetwear, and luxury maison artifacts. Every item passes rigorous physical
              multi-point inspection before disbursal.
            </p>
          </div>

          {/* Catalog links */}
          <div>
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-white mb-4">
              COLLECTIONS
            </h4>
            <ul className="space-y-2 text-xs font-mono">
              <li>
                <Link href="/sneakers" className="hover:text-acid transition-colors">
                  Sneakers
                </Link>
              </li>
              <li>
                <Link href="/streetwear" className="hover:text-acid transition-colors">
                  Streetwear
                </Link>
              </li>
              <li>
                <Link href="/luxury" className="hover:text-acid transition-colors">
                  Luxury Fashion
                </Link>
              </li>
              <li>
                <Link href="/accessories" className="hover:text-acid transition-colors">
                  Accessories
                </Link>
              </li>
              <li>
                <Link href="/brands" className="hover:text-acid transition-colors">
                  Brands Index
                </Link>
              </li>
            </ul>
          </div>

          {/* Marketplace & Consignment */}
          <div>
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-white mb-4">
              SERVICES
            </h4>
            <ul className="space-y-2 text-xs font-mono">
              <li>
                <Link href="/consign" className="hover:text-acid transition-colors">
                  Consign An Item
                </Link>
              </li>
              <li>
                <Link href="/consign/new" className="hover:text-acid transition-colors">
                  Intake Protocol
                </Link>
              </li>
              <li>
                <Link href="/account" className="hover:text-acid transition-colors">
                  Consignor Portal
                </Link>
              </li>
              <li>
                <Link href="/api/health" className="hover:text-acid transition-colors">
                  System Health
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-white/5 pt-8 text-[11px] font-mono text-neutral-500">
          <div>© {new Date().getFullYear()} STREET CULTURE ARCHIVAL VAULT. ALL RIGHTS RESERVED.</div>
          <div className="flex gap-6 mt-4 sm:mt-0">
            <span>STRICT AUTHENTICITY GUARANTEE</span>
            <span>SECURE ESCROW PROTOCOL</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
