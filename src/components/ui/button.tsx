'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'gold' | 'fight' | 'ghost' | 'engage';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  // Solid gold is reserved for the single primary action on a screen.
  gold: 'bg-gold text-canvas border-gold hover:bg-[#ffd54a] active:bg-[#e0a800]',
  fight: 'bg-fight text-canvas border-fight hover:bg-[#ff5252] active:bg-[#e01f1f]',
  engage: 'bg-engage text-canvas border-engage hover:bg-[#3ade74] active:bg-[#1ba350]',
  ghost:
    'bg-transparent text-phosphor border-edgeBright hover:border-gold hover:text-gold active:bg-gold/10',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'gold', block, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        // min-h-11 = 44px: the platform touch-target floor.
        'inline-flex min-h-11 items-center justify-center gap-2 border px-4 py-3',
        'font-mono text-data font-bold uppercase tracking-[0.16em]',
        'transition-colors duration-150 [touch-action:manipulation]',
        'disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-faint',
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
