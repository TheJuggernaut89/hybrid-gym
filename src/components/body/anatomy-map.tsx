'use client';

import { useId, useMemo, useState } from 'react';
import {
  BACK_REGIONS,
  DETAIL_BACK,
  DETAIL_FRONT,
  FRONT_REGIONS,
  REGION_LABEL,
  SHELL_BACK,
  SHELL_FRONT,
  type RegionId,
  type RegionShape,
} from '@/lib/anatomy';
import { cn } from '@/lib/utils';

export interface AnatomyMapProps {
  /** Muscles the drill is meant to load. */
  target?: RegionId[];
  /** Joints under load the engine is watching. */
  strain?: RegionId[];
  /** Currently firing this rep. */
  active?: RegionId[];
  /** Tapped by the fighter in the post-check. */
  selected?: RegionId[];
  onSelect?: (region: RegionId) => void;
  className?: string;
}

type Tone = 'idle' | 'target' | 'strain' | 'active' | 'selected';

const TONE_FILL: Record<Tone, string> = {
  idle: '#1C1C1C',
  target: 'rgba(34,197,94,0.5)',
  active: 'rgba(255,193,7,0.62)',
  strain: 'rgba(255,42,42,0.45)',
  selected: 'rgba(255,42,42,0.62)',
};

const TONE_STROKE: Record<Tone, string> = {
  idle: '#3A3A3A',
  target: '#22C55E',
  active: '#FFC107',
  strain: '#FF2A2A',
  selected: '#FF2A2A',
};

export function AnatomyMap({
  target = [],
  strain = [],
  active = [],
  selected = [],
  onSelect,
  className,
}: AnatomyMapProps) {
  const toneFor = useMemo(() => {
    const t = new Set(target);
    const s = new Set(strain);
    const a = new Set(active);
    const sel = new Set(selected);
    return (id: RegionId): Tone => {
      if (sel.has(id)) return 'selected';
      if (s.has(id)) return 'strain';
      if (a.has(id)) return 'active';
      if (t.has(id)) return 'target';
      return 'idle';
    };
  }, [target, strain, active, selected]);

  // One view at a time, at full panel width.
  //
  // Side by side, each figure rendered at roughly 120px across on a phone —
  // narrower than a thumbnail. At that size anatomical detail is not merely
  // hard to read, it is below the resolution it is drawn at: individual muscle
  // heads, fibre direction and tendinous intersections all collapse into a
  // silhouette, and a detailed plate looks identical to a crude one. Doubling
  // the width is what actually makes the anatomy legible.
  const [view, setView] = useState<'front' | 'back'>('front');
  const isFront = view === 'front';

  return (
    <div className={cn('border border-edge', className)}>
      <div className="rule-grid grid-cols-2 border-b border-edge" role="tablist">
        {(['front', 'back'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              'min-h-11 font-mono text-micro uppercase tracking-[0.18em] [touch-action:manipulation]',
              view === v ? 'bg-gold text-canvas' : 'bg-canvas text-dim hover:text-phosphor',
            )}
          >
            {v === 'front' ? 'Anterior' : 'Posterior'}
          </button>
        ))}
      </div>

      <Figure
        caption={isFront ? 'Anterior' : 'Posterior'}
        regions={isFront ? FRONT_REGIONS : BACK_REGIONS}
        shell={isFront ? SHELL_FRONT : SHELL_BACK}
        detail={isFront ? DETAIL_FRONT : DETAIL_BACK}
        toneFor={toneFor}
        onSelect={onSelect}
      />
    </div>
  );
}

function Figure({
  caption,
  regions,
  shell,
  detail,
  toneFor,
  onSelect,
}: {
  caption: string;
  regions: RegionShape[];
  shell: string[];
  detail: string[];
  toneFor: (id: RegionId) => Tone;
  onSelect?: (region: RegionId) => void;
}) {
  const interactive = Boolean(onSelect);
  const uid = useId().replace(/:/g, '');
  const hatchId = `hatch-${uid}`;

  return (
    <div className="bg-canvas">
      <div className="flex items-center justify-between border-b border-edge px-2 py-1">
        <span className="font-mono text-micro uppercase text-faint">{caption}</span>
        <span className="font-mono text-micro text-faint" aria-hidden>
          +
        </span>
      </div>

      {/* Height-constrained rather than width-filled: the plate is 1:2.1, so
          `w-full` on a phone produced an 830px-tall figure that pushed
          everything else off screen. Capping the height keeps the whole figure
          on screen while staying wide enough for the muscle heads to resolve. */}
      <svg
        viewBox="0 0 200 420"
        className="mx-auto h-[min(52vh,400px)] w-auto"
        role="img"
        aria-label={`${caption} muscle map`}
      >
        <defs>
          {/* Strain is signalled by hatching as well as colour, so it survives
              a colourblind reader and a greyscale screenshot. */}
          <pattern
            id={hatchId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="rgba(255,42,42,0.28)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#FF2A2A" strokeWidth="2" />
          </pattern>
        </defs>

        {/* skull, hands, feet */}
        {shell.map((d, i) => (
          <path key={`shell-${i}`} d={d} fill="#141414" stroke="#3A3A3A" strokeWidth="1.2" />
        ))}

        {regions.map((region, i) => {
          const tone = toneFor(region.id);
          const isStrain = tone === 'strain' || tone === 'selected';
          const isTarget = tone === 'target';

          return (
            <path
              key={`${region.id}-${i}`}
              d={region.d}
              fill={isStrain ? `url(#${hatchId})` : TONE_FILL[tone]}
              stroke={TONE_STROKE[tone]}
              strokeWidth={tone === 'idle' ? 1 : 1.6}
              strokeLinejoin="round"
              className={cn(
                'transition-[fill,stroke] duration-200',
                isStrain && 'animate-strain-pulse',
                isTarget && 'animate-engage-breathe',
                interactive && 'cursor-pointer',
              )}
              onClick={interactive ? () => onSelect?.(region.id) : undefined}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(region.id);
                      }
                    }
                  : undefined
              }
            >
              <title>{REGION_LABEL[region.id]}</title>
            </path>
          );
        })}

        {/* anatomical hairlines over the top */}
        {detail.map((d, i) => (
          <path
            key={`detail-${i}`}
            d={d}
            stroke="#4A4A4A"
            strokeWidth="0.9"
            fill="none"
            className="pointer-events-none"
          />
        ))}
      </svg>
    </div>
  );
}

export function AnatomyLegend() {
  const items: Array<[string, string, boolean]> = [
    ['#22C55E', 'Feel the burn here', false],
    ['#FFC107', 'Firing now', false],
    ['#FF2A2A', 'Watch this joint', true],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map(([color, label, hatched]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 border"
            style={{
              borderColor: color,
              background: hatched
                ? `repeating-linear-gradient(45deg, ${color} 0 1.5px, transparent 1.5px 4px)`
                : `${color}66`,
            }}
          />
          <span className="font-mono text-micro uppercase text-faint">{label}</span>
        </li>
      ))}
    </ul>
  );
}
