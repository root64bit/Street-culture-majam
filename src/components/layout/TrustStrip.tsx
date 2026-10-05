import React from 'react';
import { BadgeCheck, CreditCard, HeartHandshake, PackageCheck, ShieldCheck } from 'lucide-react';

const items = [
  { icon: ShieldCheck, label: '100% AUTHENTIC' },
  { icon: CreditCard, label: 'SECURE PAYMENT' },
  { icon: HeartHandshake, label: 'BUYER PROTECTION' },
  { icon: PackageCheck, label: 'FAST DELIVERY' },
  { icon: BadgeCheck, label: 'EASY CONSIGNMENT' },
];

export function TrustStrip() {
  return (
    <section className="border-y border-black/10 bg-[#f1efe8]" aria-label="Shopping benefits">
      <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-px px-4 sm:grid-cols-5 sm:px-6">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex min-h-16 items-center justify-center gap-2 border-black/10 px-2 text-center text-[10px] font-bold tracking-[0.12em] text-black/65 sm:border-r sm:last:border-r-0">
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
