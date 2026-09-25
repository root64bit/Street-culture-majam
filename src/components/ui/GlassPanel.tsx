import React from 'react';
import { cn } from '@/lib/utils';

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: 'subtle' | 'medium' | 'heavy';
  interactive?: boolean;
}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, intensity = 'medium', interactive = false, children, ...props }, ref) => {
    const intensityStyles = {
      subtle: 'bg-white/[0.02] border-white/[0.05] backdrop-blur-sm',
      medium: 'bg-white/[0.04] border-white/[0.08] backdrop-blur-md',
      heavy: 'bg-white/[0.07] border-white/[0.12] backdrop-blur-xl',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-xl border p-6 transition-all duration-300',
          intensityStyles[intensity],
          interactive &&
            'cursor-pointer hover:border-white/20 hover:bg-white/[0.06] hover:shadow-glass',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = 'GlassPanel';
