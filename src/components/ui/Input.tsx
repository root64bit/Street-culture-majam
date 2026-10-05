import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  tone?: 'dark' | 'light';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, tone = 'dark', id, type = 'text', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className={cn(
            'block text-xs font-mono font-medium tracking-wider uppercase',
            tone === 'light' ? 'text-neutral-700' : 'text-neutral-300'
          )}>
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          type={type}
          className={cn(
            'flex h-11 w-full rounded-lg border px-3.5 py-2 text-xs font-mono transition-all duration-200 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
            tone === 'light'
              ? 'border-neutral-300 bg-white text-neutral-950 placeholder:text-neutral-500 focus:border-neutral-800 focus:bg-white focus:ring-acid/50'
              : 'border-white/10 bg-white/[0.03] text-white placeholder:text-neutral-500 focus:border-acid/60 focus:bg-white/[0.06] focus:ring-acid/60',
            error && (tone === 'light'
              ? 'border-red-500 focus:border-red-600 focus:ring-red-200'
              : 'border-red-500/60 focus:border-red-500 focus:ring-red-500'),
            className
          )}
          {...props}
        />
        {error && <p className={cn('text-[11px] font-mono', tone === 'light' ? 'text-red-700' : 'text-red-400')}>{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
