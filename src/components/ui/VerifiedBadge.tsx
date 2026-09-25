import React from 'react';
import { cn } from '@/lib/utils';
import { ShieldCheck } from 'lucide-react';

export interface VerifiedBadgeProps {
  className?: string;
  variant?: 'compact' | 'full';
}

export function VerifiedBadge({ className, variant = 'full' }: VerifiedBadgeProps) {
  if (variant === 'compact') {
    return (
      <span
        title="100% Verified Authentic"
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-acid/30 bg-acid/10 px-2 py-0.5 text-[10px] font-mono tracking-wider text-acid uppercase',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" />
        <span>VERIFIED</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-acid/30 bg-acid/10 px-3 py-1 text-xs font-mono tracking-wider text-acid uppercase',
        className
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5 text-acid" />
      <span className="font-semibold">100% VERIFIED AUTHENTIC</span>
    </div>
  );
}
