import { cn } from '@/lib/utils';

/**
 * Dense tabular cell. Deliberately quiet — these cluster in grids and are the
 * "high data density" half of the layout's bimodal rhythm. Anything that needs
 * to shout should use <Readout> instead.
 */
export function Stat({
  label,
  value,
  unit,
  accent = 'phosphor',
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  accent?: 'gold' | 'fight' | 'engage' | 'phosphor' | 'neutral';
  className?: string;
}) {
  const color = {
    gold: 'text-gold',
    fight: 'text-fight',
    engage: 'text-engage',
    phosphor: 'text-phosphor',
    neutral: 'text-phosphor',
  }[accent];

  return (
    <div className={cn('bg-canvas px-3 py-2.5', className)}>
      <div className="font-mono text-micro uppercase text-faint">{label}</div>
      <div className={cn('display telemetry mt-1.5 text-h3', color)}>
        {value}
        {unit ? <span className="ml-1 font-mono text-micro text-faint">{unit}</span> : null}
      </div>
    </div>
  );
}

import { SegmentMeter } from './industrial';

/** Adapter keeping the original call sites working over the segmented meter. */
export function Meter({
  pct,
  accent = 'gold',
  segments,
  className,
}: {
  pct: number;
  accent?: 'gold' | 'fight' | 'engage';
  segments?: number;
  className?: string;
}) {
  return <SegmentMeter pct={pct} tone={accent} segments={segments} className={className} />;
}
