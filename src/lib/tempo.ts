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

export const WINDOW_DAYS = 28;
const DAY_MS = 86_400_000;

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

export function computeTempo(sessionDates: string[], now = new Date()): Tempo {
  const t = now.getTime();
  const times = sessionDates
    .map((d) => new Date(d).getTime())
    .filter((n) => Number.isFinite(n) && n <= t)
    .sort((a, b) => b - a);

  const currentWindow = times.filter((n) => n >= t - WINDOW_DAYS * DAY_MS);
  const priorWindow = times.filter(
    (n) => n < t - WINDOW_DAYS * DAY_MS && n >= t - 2 * WINDOW_DAYS * DAY_MS,
  );

  const weeks = WINDOW_DAYS / 7;
  const current = Math.round((currentWindow.length / weeks) * 10) / 10;
  const previous = Math.round((priorWindow.length / weeks) * 10) / 10;
  const delta = Math.round((current - previous) * 10) / 10;

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
