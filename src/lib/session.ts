/**
 * SESSION — the universal training record.
 *
 * The app previously could only see two things: a cardio console it could OCR,
 * and a solo drill done at home. Everything else a gym floor actually contains
 * — free weights, machines, spin, HIIT, yoga, martial arts, coached sessions —
 * was invisible. That is not a gap in coverage, it is a gap in the model: a
 * "session" was a byproduct of a capture method rather than a thing in its own
 * right.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY sRPE IS THE CURRENCY
 *
 * The old XP formula was driven ~88% by calories burned. That silently ranks
 * members by modality rather than by effort: a member walking on a treadmill
 * out-scores a member squatting heavily, and a member in a technique class
 * scores zero. For a mixed-membership gym that is a retention bug.
 *
 * Session-RPE (Foster) — duration in minutes x RPE on a 0-10 scale — is the
 * standard cross-modality internal-load measure precisely because it does not
 * care what you did, only how long and how hard. It is the only common unit
 * that a lifter, a spin member and a fighter can all be scored on fairly.
 *
 * Everything here is pure. Persistence lives in the session actions.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { StatKey } from './types';

/* ── modality taxonomy ────────────────────────────────────────────────── */

export interface SessionType {
  id: string;
  label: string;
  /** Which attribute this modality primarily develops. */
  stat: StatKey;
  /** Sensible default duration, so quick-log is two taps for the common case. */
  defaultMin: number;
  /** Shown under the label when picking. */
  hint: string;
}

/**
 * Deliberately short. A long list is a worse quick-log than a short one, and
 * every extra option is a decision between the member and a logged session.
 */
export const SESSION_TYPES: SessionType[] = [
  { id: 'lift',     label: 'LIFT',      stat: 'strength', defaultMin: 60, hint: 'Weights, machines, calisthenics' },
  { id: 'conditioning', label: 'ENGINE', stat: 'engine',  defaultMin: 30, hint: 'Cardio, intervals, erg, run' },
  { id: 'class',    label: 'CLASS',     stat: 'engine',   defaultMin: 45, hint: 'Spin, HIIT, bootcamp, circuits' },
  { id: 'combat',   label: 'COMBAT',    stat: 'craft',    defaultMin: 60, hint: 'Striking, grappling, sparring, pads' },
  { id: 'skill',    label: 'SKILL',     stat: 'craft',    defaultMin: 30, hint: 'Technique work, drilling, coached form' },
  { id: 'power',    label: 'POWER',     stat: 'power',    defaultMin: 40, hint: 'Olympic lifts, plyo, sprints, throws' },
  { id: 'mobility', label: 'MOBILITY',  stat: 'recovery', defaultMin: 30, hint: 'Yoga, stretching, rehab, recovery work' },
];

export function sessionTypeFor(id: string): SessionType | null {
  return SESSION_TYPES.find((t) => t.id === id) ?? null;
}

/**
 * Maps a timetabled class name onto a session type, so honouring a booking
 * writes a correctly-attributed session without asking the member what kind of
 * class they just attended — they know, and so does the timetable.
 *
 * Falls back to 'class' rather than guessing: a mis-attributed session is worse
 * than a generically-attributed one, because the modality mix drives what the
 * app recommends next.
 */
export function sessionTypeForClass(className: string): SessionType {
  const n = (className || '').toLowerCase();
  const match = (...keys: string[]) => keys.some((k) => n.includes(k));

  if (match('yoga', 'mobility', 'stretch', 'recovery', 'pilates')) return sessionTypeFor('mobility')!;
  if (match('muay', 'bjj', 'boxing', 'grappl', 'mma', 'spar', 'wrestl', 'judo', 'silat', 'kickbox'))
    return sessionTypeFor('combat')!;
  if (match('strength', 'lift', 'weight', 'barbell', 'powerlift', 'floor')) return sessionTypeFor('lift')!;
  if (match('olympic', 'plyo', 'sprint', 'explosive')) return sessionTypeFor('power')!;
  if (match('technique', 'skill', 'drill', 'fundamental')) return sessionTypeFor('skill')!;
  // Cardio had no keywords at all, so "Cardio — bike" fell through to 'class'
  // and was attributed to craft instead of engine — which then skewed the
  // modality mix and therefore what the app recommended next.
  if (match('cardio', 'bike', 'row', 'tread', 'run', 'erg', 'stair', 'elliptical', 'condition'))
    return sessionTypeFor('conditioning')!;
  return sessionTypeFor('class')!;
}

/**
 * Session type for a declared slot, given what kind of slot it was.
 *
 * A floor or cardio declaration carries a label the member did not write, so
 * keyword-matching it is guesswork with a known answer available.
 */
export function sessionTypeForDeclaration(
  kind: 'class' | 'floor' | 'cardio',
  className: string,
): SessionType {
  if (kind === 'floor') return sessionTypeFor('lift')!;
  if (kind === 'cardio') return sessionTypeFor('conditioning')!;
  return sessionTypeForClass(className);
}

/* ── the load unit ────────────────────────────────────────────────────── */

export const RPE_MIN = 1;
export const RPE_MAX = 10;

/** Borg CR10 anchors. Members rate far more consistently with words than numbers. */
export const RPE_ANCHORS: Array<{ rpe: number; word: string; feel: string }> = [
  { rpe: 2, word: 'EASY', feel: 'Could go all day' },
  { rpe: 4, word: 'STEADY', feel: 'Talking is comfortable' },
  { rpe: 6, word: 'WORKING', feel: 'Short sentences only' },
  { rpe: 8, word: 'HARD', feel: 'A few words, breathing heavy' },
  { rpe: 10, word: 'MAXIMAL', feel: 'Nothing left' },
];

export function anchorFor(rpe: number): { word: string; feel: string } {
  const r = clampRpe(rpe);
  let best = RPE_ANCHORS[0];
  for (const a of RPE_ANCHORS) if (r >= a.rpe) best = a;
  return { word: best.word, feel: best.feel };
}

export function clampRpe(rpe: number): number {
  if (!Number.isFinite(rpe)) return RPE_MIN;
  return Math.min(RPE_MAX, Math.max(RPE_MIN, Math.round(rpe)));
}

/**
 * Session load in arbitrary units (AU). Foster's session-RPE.
 * 60 min at RPE 7 = 420 AU. 30 min at RPE 4 = 120 AU.
 */
export function sessionLoad(minutes: number, rpe: number): number {
  const min = Math.max(0, Math.min(minutes, 300)); // a 5h session is a typo
  return Math.round(min * clampRpe(rpe));
}

/**
 * XP from a session.
 *
 * Deliberately just the load. Any multiplier per modality would re-introduce
 * exactly the bias sRPE exists to remove — the moment COMBAT is worth 1.2x, the
 * app is telling a member their spin class matters less.
 */
export function xpFromSession(minutes: number, rpe: number): number {
  return sessionLoad(minutes, rpe);
}

/* ── load management ──────────────────────────────────────────────────── */

export interface DailyLoad {
  /** YYYY-MM-DD */
  date: string;
  load: number;
}

/** Buckets sessions into per-day totals across the trailing `days`. */
export function dailyLoads(
  sessions: Array<{ created_at: string; load: number }>,
  days: number,
  now = new Date(),
): DailyLoad[] {
  const DAY = 86_400_000;
  const end = new Date(now);
  const out: DailyLoad[] = [];

  const byDate = new Map<string, number>();
  for (const s of sessions) {
    const t = new Date(s.created_at);
    if (!Number.isFinite(t.getTime())) continue;
    const key = isoDate(t);
    byDate.set(key, (byDate.get(key) ?? 0) + (Number(s.load) || 0));
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * DAY);
    const key = isoDate(d);
    out.push({ date: key, load: byDate.get(key) ?? 0 });
  }
  return out;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Monotony is unbounded as daily variance approaches zero, so it is capped for
 * display and comparison. Anything at or near this cap means "no easy days".
 */
export const MONOTONY_CAP = 5;

export type LoadFlag = 'ramping' | 'monotonous' | 'detraining' | 'steady';

export interface LoadState {
  /** Sum of the trailing 7 days, AU. */
  acute: number;
  /** Trailing 28 days expressed as a 7-day average, AU. */
  chronic: number;
  /** acute / chronic. Null until there is enough history to mean anything. */
  ratio: number | null;
  /** Foster monotony: mean daily load / SD of daily load over 7 days. */
  monotony: number | null;
  /** Foster strain: weekly load x monotony. */
  strain: number | null;
  flag: LoadFlag;
  /** Plain-language read. Never alarmist, never a diagnosis. */
  note: string;
  /**
   * True when the member should NOT be sold more training this week.
   * The commercial layer is required to honour this.
   */
  vetoUpsell: boolean;
}

/**
 * Load state from session history.
 *
 * A note on ACWR: the 0.8-1.3 "sweet spot" is widely quoted and has been
 * seriously criticised on methodological grounds (spurious correlation from
 * sharing the chronic term, arbitrary binning, weak predictive validity in
 * re-analyses). So it is computed and shown, but it is NOT the thing that
 * drives the veto on its own — monotony and strain do more work here, and a
 * ratio is only reported once there is a real chronic base to divide by.
 */
export function computeLoad(
  sessions: Array<{ created_at: string; load: number }>,
  now = new Date(),
): LoadState {
  const week = dailyLoads(sessions, 7, now);
  const month = dailyLoads(sessions, 28, now);

  const acute = week.reduce((a, d) => a + d.load, 0);
  const monthTotal = month.reduce((a, d) => a + d.load, 0);
  const chronic = Math.round(monthTotal / 4);

  const loads = week.map((d) => d.load);
  const mean = acute / 7;
  const variance = loads.reduce((a, l) => a + (l - mean) ** 2, 0) / 7;
  const sd = Math.sqrt(variance);

  // Monotony = mean / SD of daily load. As variance goes to zero the ratio goes
  // to infinity — and zero variance is the MOST monotonous case there is: the
  // same work every single day with no easy day and no rest day. Guarding
  // `sd > 0` by returning null would switch the check off exactly when it
  // should fire hardest, so zero variance pins to the cap instead.
  const monotony =
    acute <= 0 ? null : sd > 0 ? Math.min(MONOTONY_CAP, Math.round((mean / sd) * 100) / 100) : MONOTONY_CAP;
  const strain = monotony !== null ? Math.round(acute * monotony) : null;

  // Below a real chronic base a ratio is noise — a single first session gives
  // an infinite "spike" that means nothing.
  const ratio = chronic >= 200 ? Math.round((acute / chronic) * 100) / 100 : null;

  let flag: LoadFlag = 'steady';
  let note = 'Load is steady. Nothing to change.';
  let vetoUpsell = false;

  if (acute === 0 && chronic > 0) {
    flag = 'detraining';
    note = 'Nothing logged in 7 days. Load is falling off.';
  } else if (monotony !== null && monotony >= 2 && acute >= 1000) {
    // High monotony + high load is Foster's classic overtraining signature:
    // the same hard thing every day with no easy days to absorb it.
    flag = 'monotonous';
    note = 'Same load every day with no easy days. Vary the intensity before adding more.';
    vetoUpsell = true;
  } else if (ratio !== null && ratio >= 1.5) {
    flag = 'ramping';
    note = 'This week is well above your recent baseline. Hold here before adding more.';
    vetoUpsell = true;
  } else if (ratio !== null && ratio >= 1.3) {
    flag = 'ramping';
    note = 'Climbing faster than your recent baseline. Worth an easy day.';
  }

  return { acute, chronic, ratio, monotony, strain, flag, note, vetoUpsell };
}

/**
 * Which trainable qualities has this member actually touched?
 *
 * This is the honest basis for recommending a class: not "you look unfit", but
 * "you have not trained this quality". Returns per-stat share of total load.
 */
export function modalityMix(
  sessions: Array<{ stat: StatKey; load: number }>,
): Record<string, number> {
  const total = sessions.reduce((a, s) => a + (Number(s.load) || 0), 0);
  const mix: Record<string, number> = {};
  if (total <= 0) return mix;
  for (const s of sessions) {
    mix[s.stat] = (mix[s.stat] ?? 0) + (Number(s.load) || 0) / total;
  }
  for (const k of Object.keys(mix)) mix[k] = Math.round(mix[k] * 100) / 100;
  return mix;
}
