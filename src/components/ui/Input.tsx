import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, type = 'text', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-mono font-medium tracking-wider text-neutral-300 uppercase">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          type={type}
          className={cn(
            'flex h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-mono text-white placeholder:text-neutral-500 focus:border-acid/60 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-acid/60 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-500/60 focus:border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && <p className="text-[11px] font-mono text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
