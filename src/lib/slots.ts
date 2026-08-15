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

export type DeclineReason = 'kerja' | 'penat' | 'sakit' | 'jam' | 'family';

export const DECLINE_REASONS: Array<{
  code: DeclineReason;
  label: string;
  gloss: string;
}> = [
  { code: 'kerja', label: 'Kerja', gloss: 'Work ran over' },
  { code: 'penat', label: 'Penat', gloss: 'Too tired' },
  { code: 'sakit', label: 'Sakit', gloss: 'Hurt or unwell' },
  { code: 'jam', label: 'Jam', gloss: 'Traffic' },
  { code: 'family', label: 'Family', gloss: 'Family commitment' },
];

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

export interface SlotDeclaration {
  id: string;
  gymSlotId: string | null;
  className: string;
  coachName: string;
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
  const hhmm = start.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (mins > 30) {
    return `${d.className} with ${d.coachName} at ${hhmm}. Pack the bag now, not later — that is the step people skip.`;
  }
  if (mins > 0) {
    return `${hhmm}, ${mins} minutes. If you are not moving toward the door, take the downgrade instead of the miss.`;
  }
  return `${d.className} is running now. Log it when you are done.`;
}

/** Builds the concrete datetime for a timetable slot on the next matching day. */
export function nextOccurrence(slot: GymSlot, from = new Date()): Date {
  const [h, m] = slot.startTime.split(':').map(Number);
  const d = new Date(from);
  d.setHours(h, m ?? 0, 0, 0);

  let delta = (slot.dayOfWeek - d.getDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= from.getTime()) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

/** The coming week of timetable options, soonest first. */
export function weekAhead(slots: GymSlot[], from = new Date()) {
  return slots
    .map((slot) => ({ slot, at: nextOccurrence(slot, from) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
