import React from 'react';
import { ShieldCheck, Lock, Eye } from 'lucide-react';

export function TrustStrip() {
  const items = [
    {
      icon: <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse inline-block" />,
      label: '100% VERIFIED AUTHENTIC',
    },
    {
      icon: <Eye className="h-3.5 w-3.5 text-neutral-400" />,
      label: 'PHYSICAL SPECIALIST INSPECTION',
    },
    {
      icon: <ShieldCheck className="h-3.5 w-3.5 text-neutral-400" />,
      label: 'ZERO COUNTERFEITS GUARANTEED',
    },
    {
      icon: <Lock className="h-3.5 w-3.5 text-neutral-400" />,
      label: 'GLOBAL CONSIGNMENT VAULT',
    },
  ];

  return (
    <div className="w-full border-y border-white/5 bg-vault-950/80 backdrop-blur-md py-2.5">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 text-[11px] font-mono tracking-wider text-neutral-400 uppercase">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {item.icon}
            <span className={idx === 0 ? 'text-acid font-semibold' : ''}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
