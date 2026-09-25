import React from 'react';
import { cn } from '@/lib/utils';

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status.toUpperCase();

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'LIVE':
      case 'APPROVED':
      case 'AUTHENTICATED':
      case 'PASSED':
      case 'PAID':
      case 'DELIVERED':
        return 'border-acid/40 bg-acid/10 text-acid';
      case 'PENDING':
      case 'PENDING_REVIEW':
      case 'PENDING_AUTHENTICATION':
      case 'IN_TRANSIT':
      case 'RECEIVED':
      case 'SUBMITTED':
      case 'PROCESSING':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
      case 'REJECTED':
      case 'FAILED':
      case 'CANCELLED':
      case 'AUTHENTICATION_FAILED':
        return 'border-red-500/40 bg-red-500/10 text-red-400';
      case 'DRAFT':
      case 'ARCHIVED':
      default:
        return 'border-neutral-700 bg-neutral-800/50 text-neutral-300';
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-medium tracking-wider uppercase',
        getStatusColor(normalized),
        className
      )}
    >
      {normalized.replace(/_/g, ' ')}
    </span>
  );
}
