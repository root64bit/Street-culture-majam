import React from 'react';
import { cn } from '@/lib/utils';

export function ProductGrid({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
