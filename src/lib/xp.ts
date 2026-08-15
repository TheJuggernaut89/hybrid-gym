import type { Fighter, StatKey } from './types';
import { sessionLoad } from './session';

/** Level = floor(0.1 * sqrt(total_xp)) + 1  — mirrors public.level_for_xp(). */
export function levelForXp(totalXp: number): number {
  return Math.floor(0.1 * Math.sqrt(Math.max(totalXp, 0))) + 1;
}

/** Inverse of the level curve: total XP required to first reach `level`. */
export function xpAtLevel(level: number): number {
  return Math.pow((Math.max(level, 1) - 1) * 10, 2);
}

export interface LevelProgress {
  level: number;
  intoLevel: number;
  levelSpan: number;
  pct: number;
  toNext: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelForXp(totalXp);
  const floorXp = xpAtLevel(level);
  const ceilXp = xpAtLevel(level + 1);
  const levelSpan = Math.max(ceilXp - floorXp, 1);
  const intoLevel = Math.max(totalXp - floorXp, 0);
  return {
    level,
    intoLevel,
    levelSpan,
    pct: Math.min(100, Math.round((intoLevel / levelSpan) * 100)),
    toNext: Math.max(ceilXp - totalXp, 0),
  };
}

/**
 * Console-read cardio, on the shared load scale.
 *
 * The old formula was `calories * 1.5 + minutes * 2`, which made calories ~88%
 * of the score. That silently ranked members by modality: a member walking on a
 * treadmill out-earned a member squatting heavily, and anyone in a class earned
 * nothing at all. Calories are now metadata, not currency — see session.ts.
 *
 * RPE defaults to 6 ("working") when the member does not supply one, because a
 * logged console session with no rating is far more often steady work than
 * either a warm-up or a maximal effort.
 */
export function xpFromOcr(input: {
  activeMinutes?: number | null;
  rpe?: number | null;
}): number {
  const min = Math.max(input.activeMinutes ?? 0, 0);
  return sessionLoad(min, input.rpe ?? 6);
}

/**
 * On-device drill work, on the same scale.
 *
 * Accuracy is a QUALITY signal, not an intensity one, so it modulates the load
 * rather than driving it: a well-executed drill is worth up to 20% more than a
 * sloppy one, but five minutes of shadow work is still five minutes and cannot
 * out-earn an hour on the floor. Drills are short by design; the honest
 * consequence is that they are a small slice of weekly load.
 */
export function xpFromHome(input: {
  accuracy: number;
  durationSeconds: number;
  rpe?: number | null;
}): number {
  const acc = Math.min(Math.max(input.accuracy, 0), 100);
  const minutes = Math.max(input.durationSeconds, 0) / 60;
  const quality = 0.9 + (acc / 100) * 0.3; // 0.9x at 0%, 1.2x at 100%
  return Math.round(sessionLoad(minutes, input.rpe ?? 5) * quality);
}

/** Flat logging bounty for nutrition capture — not defined by the spec math. */
export const XP_NUTRITION_LOG = 35;

/**
 * Which quality a machine develops.
 *
 * The rower previously fed STRENGTH, which is wrong: a Concept2 piece is an
 * aerobic stimulus, not a maximal-force one. Every console-based machine here
 * is conditioning work.
 */
export function statForEquipment(equipment: string): StatKey {
  switch (equipment) {
    case 'assault_bike':
    case 'ski_erg':
    case 'treadmill':
    case 'rower':
      return 'engine';
    default:
      return 'engine';
  }
}

/**
 * Trainable qualities, not modalities — so a member on the weights floor and a
 * member on the mats are scored on the same axes. See StatKey in types.ts.
 */
const RADAR_ORDER = [
  { key: 'craft', label: 'CRAFT' },
  { key: 'engine', label: 'ENGINE' },
  { key: 'strength', label: 'STRENGTH' },
  { key: 'power', label: 'POWER' },
  { key: 'recovery', label: 'RECOVERY' },
] as const;

/**
 * Maps raw stat XP onto a 0-100 radar axis with a diminishing-returns curve so
 * a level-40 fighter still has somewhere to grow.
 */
function curve(xp: number, halfLife = 1200): number {
  return Math.round(100 * (1 - Math.exp(-Math.max(xp, 0) / halfLife)));
}

export interface RadarAxis {
  key: string;
  label: string;
  value: number;
  raw: number;
}

/**
 * Six axes: the five combat stats from the spec plus DISCIPLINE (streak-derived),
 * which makes the chart an actual hexagon rather than a pentagon.
 */
export function radarAxes(fighter: Fighter): RadarAxis[] {
  const axes: RadarAxis[] = RADAR_ORDER.map(({ key, label }) => {
    const raw = (fighter[`${key}_xp` as const] as number) ?? 0;
    return { key, label, value: curve(raw), raw };
  });
  axes.push({
    key: 'discipline',
    label: 'DISCIPLINE',
    value: Math.round(100 * (1 - Math.exp(-Math.max(fighter.streak_count, 0) / 14))),
    raw: fighter.streak_count,
  });
  return axes;
}

export interface CrestTier {
  name: string;
  minLevel: number;
  color: string;
}

export const CREST_TIERS: CrestTier[] = [
  { name: 'STRAY', minLevel: 1, color: '#71717A' },
  { name: 'BRAWLER', minLevel: 4, color: '#A1A1AA' },
  { name: 'HORNED', minLevel: 8, color: '#D4A017' },
  { name: 'GOLD BULL', minLevel: 14, color: '#FFC107' },
  { name: 'WARLORD', minLevel: 22, color: '#EF4444' },
  { name: 'APEX', minLevel: 32, color: '#22C55E' },
];

export function crestForLevel(level: number): CrestTier {
  let tier = CREST_TIERS[0];
  for (const t of CREST_TIERS) if (level >= t.minLevel) tier = t;
  return tier;
}
