import { cn } from '@/lib/utils';
import { TechLabel } from './industrial';

export function Panel({
  children,
  className,
  brackets = false,
}: {
  children: React.ReactNode;
  className?: string;
  brackets?: boolean;
}) {
  return (
    <section
      className={cn('relative border border-edge bg-surface', brackets && 'reg-marks', className)}
    >
      {children}
    </section>
  );
}

/**
 * Structural header. The label is the only thing carrying colour; the rule and
 * the right-hand slot stay neutral so the accent means something.
 */
export function PanelHeader({
  label,
  right,
  accent = 'phosphor',
}: {
  label: string;
  right?: React.ReactNode;
  accent?: 'gold' | 'fight' | 'engage' | 'phosphor' | 'neutral';
}) {
  const tone = accent === 'neutral' ? 'dim' : accent;

  return (
    <header className="flex items-center justify-between gap-3 border-b border-edge px-3 py-2">
      <TechLabel tone={tone} className="min-w-0 truncate">
        {label}
      </TechLabel>
      {right ? (
        <div className="shrink-0 font-mono text-micro uppercase text-faint">{right}</div>
      ) : null}
    </header>
  );
}
