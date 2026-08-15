import { crestForLevel } from '@/lib/xp';
import { cn } from '@/lib/utils';

/**
 * Bull-skull crest. Drawn as a front-facing skull: a wide brow that tapers to a
 * muzzle, with horns sweeping OUT and UP from the temples. The previous version
 * curved the horns inward, which read as a horseshoe rather than a bull.
 */
export function BullSkull({
  size = 40,
  color = '#FFC107',
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 56"
      width={size}
      height={(size * 56) / 64}
      fill="none"
      className={className}
      aria-hidden
      shapeRendering="geometricPrecision"
    >
      {/* Geometric reduction rather than anatomy: two tapered horn wedges
          sweeping up-and-out, and a trapezoid skull plate. Curves read as soft
          at small sizes — hard angles survive the 17px nav mark. */}
      <path d="M19 15 L1 6 L1 10.5 L18 23 Z" fill={color} />
      <path d="M45 15 L63 6 L63 10.5 L46 23 Z" fill={color} />
      <path d="M20 12 L44 12 L41 39 L32 52 L23 39 Z" fill={color} />
      {/* sockets and muzzle punched back out to the substrate */}
      <rect x="24.5" y="21" width="6" height="5" fill="#0A0A0A" />
      <rect x="33.5" y="21" width="6" height="5" fill="#0A0A0A" />
      <rect x="29.5" y="32" width="5" height="8" fill="#0A0A0A" />
    </svg>
  );
}

export function BullCrest({ level, size = 68 }: { level: number; size?: number }) {
  const tier = crestForLevel(level);

  return (
    <div className="flex flex-col items-stretch">
      <div
        className="relative grid place-items-center border bg-canvas"
        style={{ width: size, height: size, borderColor: tier.color }}
      >
        <BullSkull size={size * 0.62} color={tier.color} />
        <span
          className="absolute -bottom-px -right-px px-1 font-mono text-micro font-bold leading-[1.5] tracking-normal text-canvas"
          style={{ background: tier.color }}
        >
          {level}
        </span>
      </div>
      <span
        className={cn('mt-1 border-t pt-1 text-center font-mono text-micro uppercase')}
        style={{ color: tier.color, borderColor: `${tier.color}44` }}
      >
        {tier.name}
      </span>
    </div>
  );
}
