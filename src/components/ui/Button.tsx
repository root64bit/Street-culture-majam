import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'acid' | 'glass' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'glass', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acid/50 disabled:pointer-events-none disabled:opacity-50 select-none uppercase tracking-wider text-xs';

    const variants = {
      acid: 'bg-acid text-black font-semibold hover:bg-acid-hover shadow-glow active:scale-[0.98]',
      primary: 'bg-white text-black font-semibold hover:bg-neutral-200 active:scale-[0.98]',
      glass:
        'bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 backdrop-blur-md active:scale-[0.98]',
      ghost: 'bg-transparent text-neutral-300 hover:text-white hover:bg-white/[0.05]',
      outline: 'border border-neutral-700 text-neutral-200 hover:border-neutral-500 hover:text-white',
      danger: 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30',
    };

    const sizes = {
      sm: 'h-8 px-3 rounded-md text-[11px]',
      md: 'h-10 px-4 py-2 rounded-lg text-xs',
      lg: 'h-12 px-6 py-3 rounded-lg text-sm font-semibold',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Processing...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
