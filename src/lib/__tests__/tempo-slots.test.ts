/**
 * TEMPO, shields and slots
 *
 * Ported from the throwaway Node harness used during the build. These run
 * against src/lib directly, so they fail if the logic drifts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeTempo, computeShields, bandFor, bandFloor, activeProtection } from '../tempo';
import { slotPhase, nextSlot, lapsedSlots, nextOccurrence, weekAhead, tacticalLine } from '../slots';

test("TEMPO, shields and slots", () => {
let pass = 0, fail = 0;
const eq = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const ok = (n: string, cond: unknown, info?: string) => { cond ? pass++ : fail++; if (!cond) console.log(`FAIL ${n}${info?' :: '+info:''}`); };

const NOW = new Date('2026-08-14T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

// ── TEMPO ───────────────────────────────────────────────────────────────────
// 16 sessions across 28 days = 4.0/wk
const steady = Array.from({ length: 16 }, (_, i) => daysAgo(i * 1.75));
const t1 = computeTempo(steady, NOW);
eq('steady tempo = 4.0/wk', t1.current, 4);
eq('steady band', t1.band, 'SHARP');

// THE CORE CLAIM: missing one session must move tempo slightly, not catastrophically.
const minusOne = computeTempo(steady.slice(1), NOW);
ok('one missed session costs 0.25/wk', Math.abs(t1.current - minusOne.current) <= 0.3,
   `${t1.current} -> ${minusOne.current}`);
ok('one missed session does not zero it', minusOne.current > 3, `${minusOne.current}`);

// A streak would read 0 here; tempo still reads a real number.
const skippedYesterday = computeTempo(steady.filter((d) => new Date(d) < new Date(NOW.getTime() - 2*86400000)), NOW);
ok('a two-day gap leaves tempo healthy', skippedYesterday.current >= 3.4, `${skippedYesterday.current}`);

eq('no sessions = dormant', computeTempo([], NOW).band, 'DORMANT');
eq('no sessions = 0/wk', computeTempo([], NOW).current, 0);
eq('never trained: daysSinceLast null', computeTempo([], NOW).daysSinceLast, null);

// trend detection across the two windows
const climbing = computeTempo(
  [...Array.from({length:12},(_,i)=>daysAgo(i*2)), ...Array.from({length:4},(_,i)=>daysAgo(30+i*6))], NOW);
ok('climbing detected', climbing.trend === 'climbing', `${climbing.previous} -> ${climbing.current}`);

const slipping = computeTempo(
  [...Array.from({length:3},(_,i)=>daysAgo(i*8)), ...Array.from({length:14},(_,i)=>daysAgo(29+i*2))], NOW);
ok('slipping detected', slipping.trend === 'slipping', `${slipping.previous} -> ${slipping.current}`);

// future-dated sessions must not inflate the figure
ok('future sessions ignored',
   computeTempo([...steady, new Date(NOW.getTime()+86400000).toISOString()], NOW).current === t1.current);

// bands
eq('band 5.0', bandFor(5), 'RELENTLESS');
eq('band 3.0', bandFor(3), 'CONSISTENT');
eq('band 0', bandFor(0), 'DORMANT');
ok('band floors ascend', bandFloor('RELENTLESS') > bandFloor('SHARP') &&
                          bandFloor('SHARP') > bandFloor('CONSISTENT'));
ok('daysSinceLast counts', computeTempo([daysAgo(3)], NOW).daysSinceLast === 3);

// ── SHIELDS ─────────────────────────────────────────────────────────────────
eq('0 sessions mints nothing', computeShields(0, 0).available, 0);
eq('4 sessions still nothing', computeShields(4, 0).available, 0);
eq('5 sessions mints one', computeShields(5, 0).available, 1);
eq('toNext counts down', computeShields(3, 0).toNext, 2);
eq('15 sessions mints three', computeShields(15, 0).available, 3);
eq('capped at three', computeShields(100, 0).available, 3);
ok('cap parks the counter', computeShields(100, 0).toNext === 0);
eq('spending reduces the bank', computeShields(15, 2).available, 1);
eq('cannot go negative', computeShields(5, 99).available, 0);
ok('minted is reported separately from available', computeShields(100, 0).minted === 20);

// ── SLOTS ───────────────────────────────────────────────────────────────────
const decl = (mins, over = {}) => ({
  id: 'd1', gymSlotId: 'g1', className: 'Muay Thai', coachName: 'Coach Faiz',
  scheduledFor: new Date(NOW.getTime() + mins * 60000).toISOString(),
  durationMin: 60, status: 'declared', downgradeTo: null, declineReason: null, ...over,
});

eq('T-120 is scheduled',    slotPhase(decl(120), NOW), 'scheduled');
eq('T-60 is approaching',   slotPhase(decl(60),  NOW), 'approaching');
eq('T-91 still scheduled',  slotPhase(decl(91),  NOW), 'scheduled');
eq('T-20 is imminent',      slotPhase(decl(20),  NOW), 'imminent');
eq('in progress is active', slotPhase(decl(-10), NOW), 'active');
eq('grace window active',   slotPhase(decl(-100), NOW), 'active');   // 60 dur + 60 grace
eq('past grace is lapsed',  slotPhase(decl(-200), NOW), 'lapsed');
eq('resolved short-circuits', slotPhase(decl(-500, { status: 'honoured' }), NOW), 'resolved');
eq('declined short-circuits', slotPhase(decl(20, { status: 'declined' }), NOW), 'resolved');

const set = [decl(600), decl(60), decl(-500), decl(200)];
eq('nextSlot picks the soonest live one', nextSlot(set, NOW).scheduledFor, decl(60).scheduledFor);
eq('lapsed detected', lapsedSlots(set, NOW).length, 1);
eq('nothing declared = no next slot', nextSlot([], NOW), null);
eq('all resolved = no next slot', nextSlot([decl(60, { status: 'honoured' })], NOW), null);

// tactical line changes register as the clock closes
ok('T-90 line mentions packing', /pack the bag/i.test(tacticalLine(decl(80), NOW)));
ok('T-20 line offers the downgrade', /downgrade/i.test(tacticalLine(decl(20), NOW)));
ok('in-progress line says log it', /log it/i.test(tacticalLine(decl(-5), NOW)));

// ── timetable maths ─────────────────────────────────────────────────────────
// NOW is a Friday (2026-08-14).
eq('now is Friday', NOW.getDay(), 5);
const monday = { id:'s', code:'MON', dayOfWeek: 1, startTime: '19:30', durationMin: 60, className:'MT', coachName:'F' };
const nextMon = nextOccurrence(monday, NOW);
eq('next Monday is a Monday', nextMon.getDay(), 1);
ok('next Monday is in the future', nextMon.getTime() > NOW.getTime());
ok('next Monday is within 7 days', nextMon.getTime() - NOW.getTime() < 7 * 86400000);

// same-day slot that has already passed rolls to next week
const fridayEarly = { id:'s2', code:'FRI', dayOfWeek: 5, startTime: '06:00', durationMin: 60, className:'B', coachName:'R' };
const nextFri = nextOccurrence(fridayEarly, NOW);
ok('passed same-day slot rolls forward a week', nextFri.getTime() - NOW.getTime() > 6 * 86400000,
   `${nextFri.toISOString()}`);

const week = weekAhead([monday, fridayEarly], NOW);
ok('weekAhead sorted ascending', week[0].at.getTime() <= week[1].at.getTime());
eq('weekAhead returns every slot', week.length, 2);

// ── calendar protection ─────────────────────────────────────────────────────
ok('no protection on a normal day', activeProtection(NOW) === null);
ok('Deepavali window arms', activeProtection(new Date('2026-11-09T10:00:00')) !== null);
ok('protected windows flagged approximate',
   activeProtection(new Date('2026-11-09T10:00:00')).approximate === true);

// The harness tallies rather than throws, so without this the suite
// reports green no matter what the assertions above found.
assert.equal(fail, 0, `${fail} of ${pass + fail} assertions failed — see the FAIL lines above`);
assert.ok(pass > 0, 'suite ran no assertions at all');
});
