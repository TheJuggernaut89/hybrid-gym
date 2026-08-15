'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { cn } from '@/lib/utils';

/**
 * The primary call to action.
 *
 * Motion here is doing a job, not decorating: a slow pulse on the one button
 * that matters draws the eye on a dark screen full of hard-edged panels, and
 * the press-scale gives physical feedback on a phone where there is no cursor
 * to hover.
 *
 * Everything is a transform or opacity — no layout properties — so it stays on
 * the compositor, and the whole thing is skipped under prefers-reduced-motion.
 */
export function CTA({
  children,
  onClick,
  href,
  disabled,
  tone = 'primary',
  pulse = false,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: 'primary' | 'ghost';
  /** Slow attention pulse. Use on ONE element per screen, never more. */
  pulse?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    // matchMedia reverts everything it created when the query stops matching,
    // so a member who turns on Reduce Motion mid-session gets a still button.
    const mm = gsap.matchMedia();

    mm.add(
      { reduce: '(prefers-reduced-motion: reduce)', ok: '(prefers-reduced-motion: no-preference)' },
      (ctx) => {
        const { reduce } = ctx.conditions as { reduce: boolean };
        if (reduce) return;

        gsap.from(el, { autoAlpha: 0, y: 8, duration: 0.4, ease: 'power2.out' });

        if (pulse) {
          gsap.to(el, {
            scale: 1.015,
            duration: 1.6,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          });
        }
      },
    );

    return () => mm.revert();
  }, [disabled, pulse]);

  const press = () => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    // Interruptible on purpose — a fast double tap should not queue two bounces.
    gsap.to(el, { scale: 0.97, duration: 0.08, ease: 'power2.out', overwrite: 'auto' });
  };

  const release = () => {
    const el = ref.current;
    if (!el) return;
    gsap.to(el, { scale: 1, duration: 0.25, ease: 'back.out(2)', overwrite: 'auto' });
  };

  const classes = cn(
    'flex min-h-[60px] w-full items-center justify-center gap-2 border border-edge px-3',
    'font-mono text-data font-bold uppercase tracking-[0.14em] [touch-action:manipulation]',
    'will-change-transform',
    tone === 'primary' ? 'bg-gold text-canvas' : 'bg-canvas text-gold',
    disabled && 'pointer-events-none opacity-50',
    className,
  );

  const handlers = {
    onPointerDown: press,
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
  };

  if (href) {
    return (
      <a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={href}
        className={classes}
        {...handlers}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={classes}
      {...handlers}
    >
      {children}
    </button>
  );
}
