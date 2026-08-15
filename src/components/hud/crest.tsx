import { crestForLevel } from '@/lib/xp';
import { cn } from '@/lib/utils';

/**
 * The Hybrid Combative mark.
 *
 * Deliberately the SAME geometry as public/icons/bull.svg — crescent horns, an
 * angular skull converging to a point, raked eyes. The nav previously carried a
 * different, simpler bull than the app icon, so the mark a member saw on their
 * home screen was not the mark they saw at the top of the app.
 *
 * `color` is driven by crest tier on /hud and defaults to the brand gold
 * elsewhere, so the tier can recolour the whole mark without a second asset.
 */
export function BullSkull({
  size = 40,
  color = '#FFA51E',
  /** Punched-through areas. Must match whatever sits behind the mark. */
  substrate = '#0A0A0A',
  className,
}: {
  size?: number;
  color?: string;
  substrate?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="64 60 384 364"
      width={size}
      height={size}
      className={className}
      aria-hidden
      shapeRendering="geometricPrecision"
    >
      <g fill={color}>
        <path d="M182 188 C132 176 100 138 96 78 C74 140 82 200 132 238 Z" />
        <path d="M330 188 C380 176 412 138 416 78 C438 140 430 200 380 238 Z" />
      </g>
      <path
        d="M186 176 L326 176 L366 268 L256 410 L146 268 Z"
        fill={substrate}
        stroke={color}
        strokeWidth={34}
        strokeLinejoin="miter"
      />
      {/* The eyes stay red at every tier — the one fixed point in the mark. */}
      <g fill="#E4340E">
        <path d="M196 250 L244 272 L238 292 L192 268 Z" />
        <path d="M316 250 L268 272 L274 292 L320 268 Z" />
      </g>
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
