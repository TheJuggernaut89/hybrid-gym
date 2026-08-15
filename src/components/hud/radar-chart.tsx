'use client';

import { motion } from 'framer-motion';
import type { RadarAxis } from '@/lib/xp';

// Wide viewBox with generous horizontal padding: the previous chart pushed
// labels past the edge at radius x1.3 and clipped every one of them.
const VW = 300;
const VH = 250;
const CX = VW / 2;
const CY = 118;
const R = 84;
const RINGS = [0.25, 0.5, 0.75, 1];

function point(index: number, total: number, ratio: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: CX + Math.cos(angle) * R * ratio,
    y: CY + Math.sin(angle) * R * ratio,
  };
}

function polygon(values: number[]) {
  return values
    .map((v, i) => {
      const p = point(i, values.length, Math.max(v, 3) / 100);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(' ');
}

export function RadarChart({ axes }: { axes: RadarAxis[] }) {
  const values = axes.map((a) => a.value);
  const total = axes.length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        role="img"
        aria-label={`Combat profile: ${axes.map((a) => `${a.label} ${a.value}`).join(', ')}`}
      >
        {/* Rings fade toward the centre. Equally-weighted nested hexagons read
            as an isometric cube; the falloff breaks that illusion. */}
        {RINGS.map((r, i) => (
          <polygon
            key={r}
            points={polygon(values.map(() => r * 100))}
            fill="none"
            stroke="#262626"
            strokeOpacity={0.3 + i * 0.23}
            strokeWidth="1"
          />
        ))}

        {axes.map((axis, i) => {
          const p = point(i, total, 1);
          return (
            <line
              key={axis.key}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="#262626"
              strokeWidth="1"
            />
          );
        })}

        <motion.polygon
          points={polygon(values)}
          fill="rgba(255,193,7,0.14)"
          stroke="#FFC107"
          strokeWidth="2"
          strokeLinejoin="miter"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />

        {values.map((v, i) => {
          const p = point(i, total, Math.max(v, 3) / 100);
          return <rect key={i} x={p.x - 2.5} y={p.y - 2.5} width="5" height="5" fill="#FFC107" />;
        })}

        {/* labels: anchored so nothing ever leaves the box */}
        {axes.map((axis, i) => {
          const p = point(i, total, 1.16);
          const dx = p.x - CX;
          const anchor = dx < -8 ? 'end' : dx > 8 ? 'start' : 'middle';
          const pad = anchor === 'end' ? -4 : anchor === 'start' ? 4 : 0;
          return (
            <text
              key={axis.key}
              x={p.x + pad}
              y={p.y + 3}
              textAnchor={anchor}
              className="font-mono"
              fontSize="8"
              letterSpacing="1.4"
              fill="#8A8A8A"
            >
              {axis.label}
            </text>
          );
        })}
      </svg>

      {/* dense tabular readout beneath the plot */}
      <ul className="rule-grid mt-2 grid-cols-3 border border-edge">
        {axes.map((axis) => (
          <li key={axis.key} className="bg-canvas px-2 py-2">
            <div className="font-mono text-micro uppercase text-faint">{axis.label}</div>
            <div className="display telemetry mt-1 text-h3 text-phosphor">{axis.value}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
