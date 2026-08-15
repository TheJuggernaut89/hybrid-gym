import { cn } from '@/lib/utils';

/** `[ LABEL ]` — ASCII framing used for every structural header. */
export function TechLabel({
  children,
  tone = 'phosphor',
  className,
}: {
  children: React.ReactNode;
  tone?: 'phosphor' | 'gold' | 'fight' | 'engage' | 'dim';
  className?: string;
}) {
  const color = {
    phosphor: 'text-phosphor',
    gold: 'text-gold',
    fight: 'text-fight',
    engage: 'text-engage',
    dim: 'text-dim',
  }[tone];

  return (
    <span className={cn('font-mono text-meta uppercase', color, className)}>
      <span aria-hidden className="opacity-40">
        [
      </span>
      <span className="px-1.5">{children}</span>
      <span aria-hidden className="opacity-40">
        ]
      </span>
    </span>
  );
}

/**
 * Deterministic barcode strip. `seed` keeps the bar pattern stable across
 * renders so it reads as a printed marking rather than random noise.
 */
export function Barcode({ seed = 7, bars = 34, className }: { seed?: number; bars?: number; className?: string }) {
  let h = seed * 2654435761;
  const widths = Array.from({ length: bars }, () => {
    h = (h ^ (h >>> 15)) * 2246822507;
    h >>>= 0;
    return (h % 3) + 1;
  });

  return (
    <div className={cn('flex h-3 items-stretch gap-[2px] overflow-hidden', className)} aria-hidden>
      {widths.map((w, i) => (
        <span key={i} style={{ width: w }} className={i % 3 === 0 ? 'bg-edgeBright' : 'bg-edge'} />
      ))}
    </div>
  );
}

/** Diagonal hazard chevrons. Danger contexts only. */
export function HazardBar({ tone = 'fight', className }: { tone?: 'fight' | 'gold'; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('h-1.5 w-full', tone === 'fight' ? 'hazard-stripe' : 'gold-stripe', className)}
    />
  );
}

/** Registration crosshair for grid intersections. */
export function CrossHair({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('pointer-events-none absolute text-faint', className)}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M4.5 0v9M0 4.5h9" stroke="currentColor" strokeWidth="1" />
      </svg>
    </span>
  );
}

/** Fixed-width machine identifier, e.g. `UNIT / D-01`. */
export function UnitTag({ label, value }: { label: string; value: string }) {
  return (
    <span className="font-mono text-micro uppercase text-faint">
      {label} <span className="text-dim">/</span> <span className="text-dim">{value}</span>
    </span>
  );
}

/**
 * The core macro-typography block: an oversized numeral with micro metadata.
 * This is the extreme end of the scale contrast the whole design rests on.
 */
export function Readout({
  label,
  value,
  unit,
  tone = 'phosphor',
  size = 'h1',
  sub,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'phosphor' | 'gold' | 'fight' | 'engage';
  size?: 'h1' | 'h2' | 'h3' | 'hero';
  sub?: string;
  className?: string;
}) {
  const color = {
    phosphor: 'text-phosphor',
    gold: 'text-gold',
    fight: 'text-fight',
    engage: 'text-engage',
  }[tone];

  const scale = {
    hero: 'text-hero',
    h1: 'text-h1',
    h2: 'text-h2',
    h3: 'text-h3',
  }[size];

  return (
    <div className={cn('min-w-0', className)}>
      <div className="font-mono text-micro uppercase text-faint">{label}</div>
      <div className={cn('display telemetry mt-1 flex items-baseline gap-1.5', scale, color)}>
        <span className="truncate">{value}</span>
        {unit ? <span className="font-mono text-meta text-faint">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 font-mono text-micro uppercase text-faint">{sub}</div> : null}
    </div>
  );
}

/** Segmented meter. Discrete cells read as mechanical, not as a web progress bar. */
export function SegmentMeter({
  pct,
  segments = 20,
  tone = 'gold',
  className,
}: {
  pct: number;
  segments?: number;
  tone?: 'gold' | 'fight' | 'engage';
  className?: string;
}) {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * segments);
  const on = { gold: 'bg-gold', fight: 'bg-fight', engage: 'bg-engage' }[tone];

  return (
    <div
      className={cn('flex h-2.5 gap-[2px]', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn('flex-1', i < filled ? on : 'bg-edge')} />
      ))}
    </div>
  );
}
