'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A panel that starts closed.
 *
 * For reference material — history, static biometrics — that belongs on a
 * screen but is not why anyone opened it. /hud ran to 3.7 screens of scroll
 * with a third of that height spent on a combat log nobody navigated there to
 * read.
 *
 * Closed by default, but the header still states what is inside and how much
 * of it, so collapsing costs no information: a member can see there are 12
 * entries without being made to scroll past them.
 */
export function Disclosure({
  label,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  /** Shown in the header so the summary survives being collapsed. */
  count?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border border-edge bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-3 py-2.5 [touch-action:manipulation]"
      >
        <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
          [ {label} ]
        </span>
        <span className="flex items-center gap-2">
          {count ? (
            <span className="telemetry font-mono text-micro uppercase text-dim">{count}</span>
          ) : null}
          <ChevronDown
            size={14}
            className={cn('text-dim transition-transform', open && 'rotate-180')}
          />
        </span>
      </button>

      {open ? <div className="border-t border-edge">{children}</div> : null}
    </section>
  );
}
