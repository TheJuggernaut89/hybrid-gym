export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** MediaPipe Pose landmark indices (33-point model). */
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

/** Interior angle at `b`, in degrees, using the image plane only. */
export function angleAt(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magA = Math.hypot(abx, aby);
  const magC = Math.hypot(cbx, cby);
  if (magA === 0 || magC === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot / (magA * magC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** True when every required landmark is present and confidently tracked. */
export function tracked(lm: Landmark[], indices: number[], min = 0.5): boolean {
  return indices.every((i) => {
    const p = lm[i];
    return p !== undefined && (p.visibility ?? 1) >= min;
  });
}

/** Maps a measured value onto 0-100, full marks inside [good, ideal]. */
export function bandScore(value: number, poor: number, good: number): number {
  if (poor === good) return value >= good ? 100 : 0;
  const t = (value - poor) / (good - poor);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}
