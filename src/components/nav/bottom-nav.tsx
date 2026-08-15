'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Crosshair, Flame, PlusSquare, Swords, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

// Five top-level places.
//
// NOW leads because it is the only surface that exists *before* the decision to
// train. LOG sits second because it is the primary action for most of the
// membership — the weights floor, every class and the mats all reach the app
// through it.
//
// GYM (console OCR) used to be a tab of its own. It is now a shortcut inside
// LOG: once XP moved off calories, the only thing it uniquely produced stopped
// counting, and two separate "point your camera at a thing" tabs read as
// duplicates to members. STATS is a weekly ritual, so it sits last.
const LINKS = [
  { href: '/now', label: 'NOW', index: '01', Icon: Target },
  { href: '/log', label: 'LOG', index: '02', Icon: PlusSquare },
  { href: '/fuel', label: 'FUEL', index: '03', Icon: Flame },
  { href: '/home-base', label: 'FORM', index: '04', Icon: Swords },
  { href: '/hud', label: 'STATS', index: '05', Icon: Crosshair },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-canvas/97 backdrop-blur">
      <ul className="rule-grid mx-auto max-w-md grid-cols-5">
        {LINKS.map(({ href, label, index, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="bg-canvas">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // 44px minimum target, edge to edge.
                  'relative flex min-h-[52px] flex-col items-center justify-center gap-1 py-2',
                  'transition-colors duration-150 [touch-action:manipulation]',
                  active ? 'bg-gold text-canvas' : 'text-dim hover:text-phosphor',
                )}
              >
                <span
                  className={cn(
                    'absolute left-1.5 top-1 font-mono text-micro leading-none',
                    // /60 measured 4.47:1 on gold — under AA. /70 gives 6.05:1.
                    active ? 'text-canvas/70' : 'text-faint',
                  )}
                  aria-hidden
                >
                  {index}
                </span>
                <Icon size={17} strokeWidth={active ? 2.5 : 1.75} />
                <span className="font-mono text-micro font-bold">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)] bg-canvas" />
    </nav>
  );
}
