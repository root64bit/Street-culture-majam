import React from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string; label: string }[];
  tone?: 'dark' | 'light';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, children, tone = 'dark', ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className={cn(
              'block font-mono text-xs font-medium uppercase tracking-wider',
              tone === 'light' ? 'text-neutral-700' : 'text-neutral-300'
            )}
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={cn(
            'flex h-11 w-full rounded-lg border border-white/10 bg-vault-900 px-3.5 py-2 font-mono text-xs text-white transition-all duration-200 focus:border-acid/60 focus:outline-none focus:ring-1 focus:ring-acid/60 disabled:cursor-not-allowed disabled:opacity-50',
            tone === 'light' && 'border-neutral-300 bg-white text-neutral-950',
            error && 'border-red-500/60 focus:border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  className={
                    tone === 'light' ? 'bg-white text-neutral-950' : 'bg-vault-900 text-white'
                  }
                >
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        {error && <p className="font-mono text-[11px] text-red-400">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
