import React from 'react';
import { cn } from '@/lib/utils';

export function Container({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mx-auto max-w-7xl px-4 sm:px-6 lg:px-8', className)} {...props}>
      {children}
    </div>
  );
}

export function Section({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('py-12 sm:py-16 lg:py-20', className)} {...props}>
      {children}
    </section>
  );
}
