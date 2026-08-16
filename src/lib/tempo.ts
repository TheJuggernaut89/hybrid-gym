/**
 * TEMPO — the replacement for the streak counter.
 *
 * A streak that can hit zero is a churn detonator: one missed session turns a
 * number into an identity verdict, and the app gets deleted. TEMPO is a rolling
 * 28-day sessions-per-week figure. Missing one session moves it by 0.25, which
 * is recoverable; the fighter sees "3.1/wk, down from 4.0" instead of "0".
 *
 * It is derived entirely from session timestamps, so it needs no schema change
 * and cannot drift out of sync with the logs.
 */

import { gymDayKey } from './slots';

export const WINDOW_DAYS = 28;
const DAY_MS = 86_400_000;

/**
 * How much of the window a member may protect.
 *
 * Two of the four weeks. Without a cap the denominator can collapse to a
 * handful of days, and a single session inside it reads as RELENTLESS.
 */
export const MAX_PROTECTED_DAYS = 14;

/** A spent shield covers the ISO week it names, not the single day. */
export const SHIELD_COVERS_DAYS = 7;

export type TempoBand =
  | 'DORMANT'
  | 'SPORADIC'
  | 'BUILDING'
  | 'CONSISTENT'
  | 'SHARP'
  | 'RELENTLESS';

export interface Tempo {
  /** Sessions per week across the trailing 28 days. */
  current: number;
  /** Same figure for the 28 days before that. */
  previous: number;
  /** current - previous. */
  delta: number;
  trend: 'climbing' | 'holding' | 'slipping';
  band: TempoBand;
  /** Raw session count inside the current window. */
  sessions: number;
  /** Days since the most recent session; null if there has never been one. */
  daysSinceLast: number | null;
  /** Sessions needed this week to hold the current band. */
  toHold: number;
  /**
   * Days inside the window discounted by a spent shield or a calendar window.
   * Zero means the figure above is the plain 28-day rate.
   */
  protectedDays: number;
}

export interface TempoOptions {
  /**
   * `shield_spends.covers_date` values — each the first day of a protected
   * week.
   */
  shieldCovers?: string[];
  /** Calendar windows (Raya, CNY, Ramadan) that overlap the trailing window. */
  calendar?: Array<{ startISO: string; endISO: string }>;
}

const BANDS: Array<{ min: number; band: TempoBand }> = [
  { min: 4.5, band: 'RELENTLESS' },
  { min: 3.5, band: 'SHARP' },
  { min: 2.5, band: 'CONSISTENT' },
  { min: 1.5, band: 'BUILDING' },
  { min: 0.25, band: 'SPORADIC' },
  { min: 0, band: 'DORMANT' },
];

export function bandFor(perWeek: number): TempoBand {
  for (const b of BANDS) if (perWeek >= b.min) return b.band;
  return 'DORMANT';
}

/** Lower edge of a band — what you have to stay above to keep the label. */
export function bandFloor(band: TempoBand): number {
  return BANDS.find((b) => b.band === band)?.min ?? 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The set of gym-calendar days inside [from, to] that a shield or the calendar
 * has discounted, capped at MAX_PROTECTED_DAYS.
 */
function protectedDayKeys(from: number, to: number, opts: TempoOptions): Set<string> {
  const keys = new Set<string>();

  const addRange = (startMs: number, days: number) => {
    for (let i = 0; i < days; i++) {
      const at = startMs + i * DAY_MS;
      if (at < from || at > to) continue;
      keys.add(gymDayKey(new Date(at)));
    }
  };

  for (const cover of opts.shieldCovers ?? []) {
    const start = new Date(cover).getTime();
    if (Number.isFinite(start)) addRange(start, SHIELD_COVERS_DAYS);
  }

  for (const w of opts.calendar ?? []) {
    const start = new Date(w.startISO).getTime();
    const end = new Date(`${w.endISO}T23:59:59`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    addRange(start, Math.floor((end - start) / DAY_MS) + 1);
  }

  // Deterministic truncation — sorted, so the same inputs always drop the same
  // days rather than whichever the Set happened to yield first.
  if (keys.size <= MAX_PROTECTED_DAYS) return keys;
  return new Set(Array.from(keys).sort().slice(-MAX_PROTECTED_DAYS));
}

export function computeTempo(
  sessionDates: string[],
  now = new Date(),
  opts: TempoOptions = {},
): Tempo {
  const t = now.getTime();
  const times = sessionDates
    .map((d) => new Date(d).getTime())
    .filter((n) => Number.isFinite(n) && n <= t)
    .sort((a, b) => b - a);

  const windowStart = t - WINDOW_DAYS * DAY_MS;
  const currentWindow = times.filter((n) => n >= windowStart);
  const priorWindow = times.filter(
    (n) => n < windowStart && n >= t - 2 * WINDOW_DAYS * DAY_MS,
  );

  const weeks = WINDOW_DAYS / 7;
  // The plain rate. Whatever protection does, it may never drag the number
  // BELOW this.
  const raw = currentWindow.length / weeks;

  const protectedKeys = protectedDayKeys(windowStart, t, opts);
  let current = raw;

  if (protectedKeys.size > 0 && protectedKeys.size < WINDOW_DAYS) {
    const effectiveDays = WINDOW_DAYS - protectedKeys.size;
    const unprotectedSessions = currentWindow.filter(
      (n) => !protectedKeys.has(gymDayKey(new Date(n))),
    ).length;
    const adjusted = unprotectedSessions / (effectiveDays / 7);

    /*
     * The guard that makes this honest.
     *
     * Shrinking the denominator raises the quotient, so the naive version of
     * this feature hands a member a BIGGER number on the day they declare they
     * are not training. That is worse than the sag it was meant to fix: the
     * headline figure would reward staying home.
     *
     * A shield may hold the rate the member had built before the protected
     * period, and no more. `baseline` is TEMPO as it stood the moment
     * protection began; `adjusted` is capped to it, and the result can only
     * move the number up from `raw` toward where it already was.
     */
    const firstProtected = Array.from(protectedKeys).sort()[0];
    // Explicit Z. A bare "YYYY-MM-DDTHH:mm:ss" is parsed as RUNTIME-LOCAL, which
    // would make the baseline — and therefore the member's headline number —
    // depend on which machine rendered the page.
    const baselineAt = new Date(`${firstProtected}T00:00:00Z`).getTime();
    const baseline =
      times.filter((n) => n < baselineAt && n >= baselineAt - WINDOW_DAYS * DAY_MS)
        .length / weeks;

    current = Math.max(raw, Math.min(adjusted, baseline));
  }

  const previous = round1(priorWindow.length / weeks);
  const delta = round1(current - previous);
  current = round1(current);

  const band = bandFor(current);
  const floor = bandFloor(band);
  // Sessions still needed inside the window to stay above the band floor.
  const toHold = Math.max(0, Math.ceil(floor * weeks) - currentWindow.length);

  return {
    current,
    previous,
    delta,
    trend: delta > 0.2 ? 'climbing' : delta < -0.2 ? 'slipping' : 'holding',
    band,
    sessions: currentWindow.length,
    daysSinceLast: times.length ? Math.floor((t - times[0]) / DAY_MS) : null,
    toHold,
    protectedDays: protectedKeys.size,
  };
}

/* ── Rest shields ─────────────────────────────────────────────────────────
 * Old model: a shield appeared free every 7 streak days. Slack that costs
 * nothing provides no persistence benefit — it was decoration. Now a shield is
 * MINTED by work (every 5th session) and SPENT deliberately with a stated
 * reason, which is what makes protecting a week feel like a decision.
 */

export const SESSIONS_PER_SHIELD = 5;
export const SHIELD_CAP = 3;

export interface ShieldState {
  available: number;
  minted: number;
  spent: number;
  /** Sessions remaining until the next shield is minted. */
  toNext: number;
  atCap: boolean;
}

export function computeShields(totalSessions: number, spent: number): ShieldState {
  const sessions = Math.max(0, Math.floor(totalSessions));
  const used = Math.max(0, Math.floor(spent));
  const minted = Math.floor(sessions / SESSIONS_PER_SHIELD);
  const available = Math.min(SHIELD_CAP, Math.max(0, minted - used));
  const atCap = available >= SHIELD_CAP;
  return {
    available,
    minted,
    spent: used,
    // At the cap the counter would tick pointlessly, so it parks.
    toNext: atCap ? 0 : SESSIONS_PER_SHIELD - (sessions % SESSIONS_PER_SHIELD),
    atCap,
  };
}

/* ── Calendar protection ──────────────────────────────────────────────────
 * Balik kampung for Raya, CNY, Deepavali and Ramadan are not adherence
 * failures — they are the calendar. These windows arm automatically and are
 * labelled with pride rather than counted as a lapse.
 *
 * Dates are approximate and deliberately declared as such: the Hijri dates in
 * particular must be confirmed against an authoritative source before any of
 * this drives user-visible copy.
 */
export interface ProtectedWindow {
  code: string;
  label: string;
  startISO: string;
  endISO: string;
  /** True when the dates still need confirming against an official calendar. */
  approximate: boolean;
}

export const PROTECTED_WINDOWS: ProtectedWindow[] = [
  { code: 'RAMADAN', label: 'Bulan Puasa', startISO: '2027-02-08', endISO: '2027-03-09', approximate: true },
  { code: 'RAYA', label: 'Hari Raya', startISO: '2027-03-10', endISO: '2027-03-16', approximate: true },
  { code: 'CNY', label: 'Chinese New Year', startISO: '2027-02-06', endISO: '2027-02-09', approximate: true },
  { code: 'DEEPAVALI', label: 'Deepavali', startISO: '2026-11-08', endISO: '2026-11-10', approximate: true },
];

export function activeProtection(now = new Date()): ProtectedWindow | null {
  const t = now.getTime();
  return (
    PROTECTED_WINDOWS.find(
      (w) => t >= new Date(w.startISO).getTime() && t <= new Date(`${w.endISO}T23:59:59`).getTime(),
    ) ?? null
  );
}
