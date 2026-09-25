import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';
import Link from 'next/link';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
}

export function EmptyState({ title, description, actionText, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.05] border border-white/10 mb-4 text-neutral-400">
        <PackageOpen className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-mono font-semibold tracking-wider text-white uppercase mb-1">
        {title}
      </h3>
      <p className="max-w-sm text-xs font-mono text-neutral-400 mb-6">
        {description}
      </p>
      {actionText && actionHref && (
        <Link href={actionHref}>
          <Button variant="acid" size="sm">
            {actionText}
          </Button>
        </Link>
      )}
    </div>
  );
}
