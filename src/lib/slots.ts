/**
 * THE SLOT — the pre-decision surface.
 *
 * The modal event in a fitness app is not a workout. It is the moment someone
 * decides *not* to go, and no screen in this app existed before that moment.
 *
 * A slot is a concrete declared intention: a day, a time, and a named coach,
 * chosen against the real timetable. The app then does three things:
 *   T-90  one tactical line with the friction already solved
 *   T-30  a graded downgrade, never a binary yes/no
 *   after one tap to log *why*, if it didn't happen
 *
 * The decline-reason log is the point. Nobody in this market has that data.
 */

export type DeclineReason = 'kerja' | 'penat' | 'sakit' | 'jam' | 'family' | 'penuh';

export const DECLINE_REASONS: Array<{
  code: DeclineReason;
  label: string;
  gloss: string;
  /**
   * The gym caused this one, not the member.
   *
   * It matters because every consumer of this list assumes the opposite. The
   * offer engine turns three of the same reason into "this slot is not working
   * — move to a different time", which is fair for traffic and insulting for a
   * night the gym turned you away. And the shield picker renders this same
   * array as reasons to spend a rest shield, where "the class was full" is not
   * a thing a member can be spending a shield on.
   */
  gymSide?: boolean;
}> = [
  { code: 'kerja', label: 'Kerja', gloss: 'Work ran over' },
  { code: 'penat', label: 'Penat', gloss: 'Too tired' },
  { code: 'sakit', label: 'Sakit', gloss: 'Hurt or unwell' },
  { code: 'jam', label: 'Jam', gloss: 'Traffic' },
  { code: 'family', label: 'Family', gloss: 'Family commitment' },
  { code: 'penuh', label: 'Penuh', gloss: 'Class was full', gymSide: true },
];

/**
 * Reasons a member can spend a rest shield for — the ones that are about them.
 * Derived rather than duplicated so a new reason cannot silently appear in the
 * shield picker again.
 */
export const SHIELD_REASONS = DECLINE_REASONS.filter((r) => !r.gymSide);

export type SlotStatus =
  | 'declared'
  | 'honoured'
  | 'downgraded'
  | 'declined'
  | 'lapsed';

export type Downgrade = 'dojo_20' | 'mobility_8';

export const DOWNGRADES: Array<{
  code: Downgrade;
  label: string;
  minutes: number;
  blurb: string;
}> = [
  { code: 'dojo_20', label: 'Form 20', minutes: 20, blurb: 'Form drill at home. Camera on, 20 minutes.' },
  { code: 'mobility_8', label: 'Mobility 8', minutes: 8, blurb: 'Eight minutes of mobility. Counts as a session.' },
];

export interface GymSlot {
  id: string;
  code: string;
  /** 0 = Sunday. */
  dayOfWeek: number;
  /** "19:30" local. */
  startTime: string;
  durationMin: number;
  className: string;
  coachName: string;
}

/**
 * Where the session happens.
 *
 * Only 'class' counts against a membership tier's class allowance — see
 * countClassesThisWeek. A floor session has no coach and no timetable row.
 */
export type SlotKind = 'class' | 'floor' | 'cardio';

/** The non-class options, as fixed chips. */
export const FLOOR_KINDS: Array<{
  kind: Exclude<SlotKind, 'class'>;
  label: string;
  blurb: string;
  durationMin: number;
}> = [
  { kind: 'floor', label: 'Weights floor', blurb: 'Barbells, racks, dumbbells', durationMin: 60 },
  { kind: 'cardio', label: 'Cardio', blurb: 'Bike, rower, treadmill', durationMin: 30 },
];

/**
 * The hours the floor is worth declaring for. Deliberately a short list of
 * chips rather than a time picker: /now is the most carefully ordered screen in
 * the app, and there is no date input anywhere in it.
 */
export const FLOOR_HOURS = ['06:00', '07:00', '12:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

export interface SlotDeclaration {
  id: string;
  gymSlotId: string | null;
  kind: SlotKind;
  className: string;
  /** Null for floor and cardio — nobody is expecting you at a squat rack. */
  coachName: string | null;
  /** ISO timestamp of the session start. */
  scheduledFor: string;
  durationMin: number;
  status: SlotStatus;
  downgradeTo: Downgrade | null;
  declineReason: DeclineReason | null;
}

/** Where a declaration sits relative to now. Drives which nudge renders. */
export type SlotPhase =
  | 'scheduled' // more than 90 min out
  | 'approaching' // T-90 to T-30
  | 'imminent' // T-30 to start
  | 'active' // running, or within a 60-min grace after it ends
  | 'lapsed' // finished, never resolved
  | 'resolved'; // honoured / downgraded / declined

export function slotPhase(d: SlotDeclaration, now = new Date()): SlotPhase {
  if (d.status !== 'declared') return 'resolved';

  const start = new Date(d.scheduledFor).getTime();
  const end = start + d.durationMin * 60_000;
  const t = now.getTime();
  const minutesOut = (start - t) / 60_000;

  if (minutesOut > 90) return 'scheduled';
  if (minutesOut > 30) return 'approaching';
  if (minutesOut > 0) return 'imminent';
  if (t <= end + 60 * 60_000) return 'active';
  return 'lapsed';
}

/** The next unresolved declaration, soonest first. */
export function nextSlot(
  declarations: SlotDeclaration[],
  now = new Date(),
): SlotDeclaration | null {
  const t = now.getTime();
  const upcoming = declarations
    .filter((d) => d.status === 'declared')
    .filter((d) => new Date(d.scheduledFor).getTime() + d.durationMin * 60_000 + 3_600_000 >= t)
    .sort(
      (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
    );
  return upcoming[0] ?? null;
}

/** Declarations that ran out without ever being resolved. */
export function lapsedSlots(
  declarations: SlotDeclaration[],
  now = new Date(),
): SlotDeclaration[] {
  return declarations.filter((d) => slotPhase(d, now) === 'lapsed');
}

/**
 * The T-90 line. Deliberately tactical rather than encouraging: it names the
 * one piece of friction most likely to stop the session, not a slogan.
 */
export function tacticalLine(d: SlotDeclaration, now = new Date()): string {
  const start = new Date(d.scheduledFor);
  const mins = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60_000));
  const hhmm = gymTime(start);

  if (mins > 30) {
    // "with undefined at 18:00" is what this produced for a floor session, and
    // the T-90 line is the one piece of copy the member is most likely to read.
    const who = d.coachName ? ` with ${d.coachName}` : '';
    return `${d.className}${who} at ${hhmm}. Pack the bag now, not later — that is the step people skip.`;
  }
  if (mins > 0) {
    return `${hhmm}, ${mins} minutes. If you are not moving toward the door, take the downgrade instead of the miss.`;
  }
  return `${d.className} is running now. Log it when you are done.`;
}

/* ── gym time ──────────────────────────────────────────────────────────────
 *
 * `gym_slots` stores a wall clock: day 1, "19:30". That is 19:30 *in Damansara*
 * and nowhere else. Every function below therefore goes through this zone
 * explicitly, and none of them may use `getHours`, `getDay`, `setHours` or a
 * bare `toLocaleString` — those read whatever zone the process happens to run
 * in, and the process runs on Netlify, in UTC.
 *
 * That is not a hypothetical. The Monday 19:30 class rendered to members as
 * TUE 03:30, and every reminder fired eight hours off, because the old
 * `nextOccurrence` built the instant with `setHours`.
 *
 * The offset is derived from the IANA zone at each instant rather than pinned
 * to +08:00. Malaysia has not observed DST since 1982 and a fixed offset would
 * work today — but a fixed offset is a silent trap for whoever reuses this in
 * another city, and deriving it costs nothing.
 */
export const GYM_TZ = 'Asia/Kuala_Lumpur';

const GYM_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: GYM_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** The gym's offset from UTC, in ms, at a given instant. */
function gymOffsetMs(instant: Date): number {
  const p: Record<string, string> = {};
  for (const { type, value } of GYM_PARTS.formatToParts(instant)) p[type] = value;

  const wallClock = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    // Some engines render midnight as "24" under hour12:false.
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  // Drop sub-second precision on both sides so the difference is a clean offset.
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Builds the concrete instant for a timetable slot on the next matching day. */
export function nextOccurrence(slot: GymSlot, from = new Date()): Date {
  const [h, m] = slot.startTime.split(':').map(Number);

  // Shift into gym-local, where the UTC accessors read the gym's wall clock.
  const offset = gymOffsetMs(from);
  const local = from.getTime() + offset;
  const d = new Date(local);

  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let target = midnight + (h * 60 + (m || 0)) * 60_000;

  let delta = (slot.dayOfWeek - d.getUTCDay() + 7) % 7;
  if (delta === 0 && target <= local) delta = 7;
  target += delta * 86_400_000;

  // Back to a real instant. The offset is re-read at the target because the
  // week ahead can cross a zone change even when today's offset is stable.
  return new Date(target - gymOffsetMs(new Date(target - offset)));
}

/**
 * The instant of a wall-clock time `dayOffset` days from today, in gym time.
 *
 * The floor has no timetable, so a floor declaration picks a day and an hour
 * directly. Same two-pass offset handling as nextOccurrence — never build this
 * with setHours.
 */
export function gymInstant(dayOffset: number, hhmm: string, from = new Date()): Date {
  const [h, m] = hhmm.split(':').map(Number);

  const offset = gymOffsetMs(from);
  const d = new Date(from.getTime() + offset);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const target = midnight + dayOffset * 86_400_000 + (h * 60 + (m || 0)) * 60_000;

  return new Date(target - gymOffsetMs(new Date(target - offset)));
}

/** The coming week of timetable options, soonest first. */
export function weekAhead(slots: GymSlot[], from = new Date()) {
  return slots
    .map((slot) => ({ slot, at: nextOccurrence(slot, from) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* ── formatting ────────────────────────────────────────────────────────────
 *
 * Pinned to the gym's zone rather than the reader's, for two reasons. A member
 * checking the timetable from a work trip wants the time they must be in the
 * room, not the time it is where they are standing. And a client component
 * that formats in device-local renders one string during SSR and a different
 * one on hydration — React discards the difference silently, which is how a
 * wrong time survives review.
 */
const FMT_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: GYM_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const FMT_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: GYM_TZ,
  weekday: 'short',
});

const FMT_DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: GYM_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const asDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d);

/** "19:30", in gym time. */
export function gymTime(d: Date | string): string {
  return FMT_TIME.format(asDate(d));
}

/** "Mon", in gym time. */
export function gymDay(d: Date | string): string {
  return FMT_DAY.format(asDate(d));
}

/** "Mon 19:30", in gym time. */
export function gymDayTime(d: Date | string): string {
  const at = asDate(d);
  return `${FMT_DAY.format(at)} ${FMT_TIME.format(at)}`;
}

/**
 * "2026-08-16" for the gym's calendar day containing this instant.
 *
 * Anything that buckets by day must go through this. A UTC day boundary is
 * 08:00 local here, so a 07:00 boxing class belongs to the previous UTC day —
 * which is how `award_xp`'s streak arithmetic ended up biased against morning
 * training.
 */
export function gymDayKey(d: Date | string): string {
  return FMT_DAY_KEY.format(asDate(d));
}

/** Whether two instants fall on the same calendar day in the gym's zone. */
export function isSameGymDay(a: Date | string, b: Date | string): boolean {
  return gymDayKey(a) === gymDayKey(b);
}

/* ── declare-row annotations ───────────────────────────────────────────────
 * Both return null, and null means "render nothing" rather than "render a
 * zero". That distinction is the whole design in each case.
 */

/**
 * "Aina, Ben +2 going" — up to two names, then a count.
 *
 * gym_mates withholds a session entirely below its cohort floor, so an empty
 * array means NO INFORMATION, never "nobody is going". An explicit "0 going"
 * would be the single most discouraging string the app could put on a button
 * whose only job is to get someone to press it.
 */
export function nodLine(mates: string[]): string | null {
  if (mates.length === 0) return null;
  const shown = mates.slice(0, 2).join(', ');
  const rest = mates.length - Math.min(2, mates.length);
  return rest > 0 ? `${shown} +${rest} going` : `${shown} going`;
}

export const SEATS_VISIBLE_AT = 0.6;

/**
 * "4 seats left" — but only once a class is actually filling.
 *
 * Below SEATS_VISIBLE_AT an honest count is discouraging rather than
 * informative: "3 of 24" does not read as "plenty of room", it reads as
 * "nobody goes to this one". And the number counts DECLARATIONS, not bodies —
 * a walk-in never touches it — so it is a nudge and never an authority on
 * whether you will get on the mat.
 */
export function seatLine(taken: number | null, capacity: number | null): string | null {
  if (taken === null || capacity === null || capacity <= 0) return null;
  if (taken / capacity < SEATS_VISIBLE_AT) return null;
  const left = Math.max(0, capacity - taken);
  if (left === 0) return 'Full';
  return left === 1 ? '1 seat left' : `${left} seats left`;
}
