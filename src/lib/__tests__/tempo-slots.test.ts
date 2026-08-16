/**
 * TEMPO, shields and slots
 *
 * Ported from the throwaway Node harness used during the build. These run
 * against src/lib directly, so they fail if the logic drifts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeTempo, computeShields, bandFor, bandFloor, activeProtection } from '../tempo';
import {
  slotPhase, nextSlot, lapsedSlots, nextOccurrence, weekAhead, tacticalLine,
  gymDay, gymDayTime, isSameGymDay, DECLINE_REASONS, SHIELD_REASONS,
  nodLine, seatLine,
} from '../slots';

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
  id: 'd1', gymSlotId: 'g1', kind: 'class', className: 'Muay Thai', coachName: 'Coach Faiz',
  scheduledFor: new Date(NOW.getTime() + mins * 60000).toISOString(),
  durationMin: 60, status: 'declared', downgradeTo: null, declineReason: null, ...over,
});

// A floor declaration has no coach. The T-90 line interpolated coachName
// directly, so this produced "Weights floor with undefined at 18:00".
const floorDecl = decl(80, {
  kind: 'floor', className: 'Weights floor', coachName: null, gymSlotId: null,
});
ok('T-90 line omits the coach when there is none',
   !/undefined|with null|\bwith\s+at\b/i.test(tacticalLine(floorDecl, NOW)),
   tacticalLine(floorDecl, NOW));
ok('T-90 line still names the session', /weights floor/i.test(tacticalLine(floorDecl, NOW)));
ok('a coached class still names the coach',
   /with Coach Faiz/.test(tacticalLine(decl(80), NOW)));

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
//
// NOW is 2026-08-14T12:00Z — Friday 20:00 in Damansara.
//
// These assert exact UTC instants and gym-zone wall clocks, never getDay() or
// getHours(). The previous version asserted `nextMon.getDay() === 1`, which is
// true in BOTH a UTC runtime and a UTC+8 one — so it passed while the shipped
// app rendered the Monday 19:30 class to members as TUE 03:30. A timezone test
// that reads the runtime zone is testing the runtime, not the code.
eq('now is Friday in gym time', gymDay(NOW), 'Fri');

const monday = { id:'s', code:'MON', dayOfWeek: 1, startTime: '19:30', durationMin: 60, className:'MT', coachName:'F' };
const nextMon = nextOccurrence(monday, NOW);
eq('Monday 19:30 resolves to the right instant', nextMon.toISOString(), '2026-08-17T11:30:00.000Z');
eq('…which reads as Mon 19:30 at the gym', gymDayTime(nextMon), 'Mon 19:30');
ok('next Monday is in the future', nextMon.getTime() > NOW.getTime());
ok('next Monday is within 7 days', nextMon.getTime() - NOW.getTime() < 7 * 86400000);

// same-day slot that has already passed rolls to next week
const fridayEarly = { id:'s2', code:'FRI', dayOfWeek: 5, startTime: '06:00', durationMin: 60, className:'B', coachName:'R' };
const nextFri = nextOccurrence(fridayEarly, NOW);
eq('passed same-day slot rolls a week', nextFri.toISOString(), '2026-08-20T22:00:00.000Z');
eq('…and still reads 06:00 at the gym', gymDayTime(nextFri), 'Fri 06:00');
ok('passed same-day slot rolls forward a week', nextFri.getTime() - NOW.getTime() > 6 * 86400000,
   `${nextFri.toISOString()}`);

// A slot later TODAY in gym time must not roll — the boundary the UTC bug
// crossed. 22:00 MYT Friday is still ahead of NOW (20:00 MYT) but is already
// "tomorrow" in UTC.
const fridayLate = { id:'s3', code:'FRI-L', dayOfWeek: 5, startTime: '22:00', durationMin: 60, className:'L', coachName:'R' };
eq('a later-today slot stays today', nextOccurrence(fridayLate, NOW).toISOString(), '2026-08-14T14:00:00.000Z');

const week = weekAhead([monday, fridayEarly], NOW);
ok('weekAhead sorted ascending', week[0].at.getTime() <= week[1].at.getTime());
eq('weekAhead returns every slot', week.length, 2);

// isSameGymDay must partition on the gym's calendar, not the runtime's.
ok('22:00 MYT is the same gym day as 20:00 MYT',
   isSameGymDay(new Date('2026-08-14T14:00:00Z'), NOW));
ok('00:30 MYT Saturday is NOT the same gym day',
   !isSameGymDay(new Date('2026-08-14T16:30:00Z'), NOW));

// ── declare-row annotations ─────────────────────────────────────────────────
// Both must return null rather than a zero. An empty mates array means the RPC
// withheld the session below its cohort floor — "no information" — and a low
// seat count is discouraging rather than informative.
eq('no mates renders nothing', nodLine([]), null);
eq('one mate', nodLine(['Aina']), 'Aina going');
eq('two mates', nodLine(['Aina', 'Ben']), 'Aina, Ben going');
eq('three or more collapse to a count', nodLine(['Aina', 'Ben', 'Cheng', 'Dee']), 'Aina, Ben +2 going');

eq('no capacity set renders nothing', seatLine(3, null), null);
eq('a quiet class renders nothing', seatLine(3, 24), null);
eq('an empty class renders nothing', seatLine(0, 20), null);
eq('a filling class shows what is left', seatLine(16, 20), '4 seats left');
eq('singular seat', seatLine(19, 20), '1 seat left');
eq('a full class says so', seatLine(20, 20), 'Full');
ok('oversell never renders a negative', !/-/.test(String(seatLine(23, 20))));

// ── decline reasons ─────────────────────────────────────────────────────────
// SHIELD_REASONS is derived by filtering gymSide, so a reason added without
// the flag silently reappears in the shield-spend picker. That is exactly what
// happened: `penuh` shipped without gymSide and "the class was full" turned up
// as a reason to spend a rest shield. The filter was right; the data was not.
ok('penuh is present as a decline reason',
   DECLINE_REASONS.some((r) => r.code === 'penuh'));
ok('penuh is NOT spendable as a shield reason',
   !SHIELD_REASONS.some((r) => r.code === 'penuh'),
   SHIELD_REASONS.map((r) => r.code).join(','));
ok('every shield reason is member-side',
   SHIELD_REASONS.every((r) => !r.gymSide));
ok('the shield picker still has the member-side five', SHIELD_REASONS.length === 5);

// ── shields and protected windows discount the TEMPO window ─────────────────
//
// NOW is 2026-08-14T12:00Z. A member training twice a week, then a week off.
const steady2wk = [8, 11.5, 15, 18.5, 22, 25.5, 29, 32.5].map((d) => daysAgo(d));

const sagged = computeTempo(steady2wk, NOW);
eq('unprotected: the week off sags the rate', sagged.current, 1.5);
eq('no protection reported', sagged.protectedDays, 0);

// A shield naming 2026-08-07 covers that day and the six after it.
const held = computeTempo(steady2wk, NOW, { shieldCovers: ['2026-08-07'] });
eq('a spent shield holds the established rate', held.current, 2);
eq('seven days discounted', held.protectedDays, 7);

// THE GUARD. Shrinking the denominator raises the quotient, so the naive
// version of this hands a member a BIGGER number on the day they declare they
// are not training. A shield may hold the rate they had built and no more.
const barely = computeTempo([daysAgo(8), daysAgo(12)], NOW, { shieldCovers: ['2026-08-07'] });
const barelyRaw = computeTempo([daysAgo(8), daysAgo(12)], NOW);
ok('a shield never inflates above the pre-shield rate',
   barely.current <= Math.max(barelyRaw.current, 0.5) + 1e-9,
   `raw ${barelyRaw.current} -> shielded ${barely.current}`);
ok('a shield never drops the rate below unprotected',
   held.current >= sagged.current && barely.current >= barelyRaw.current);

// Protection is capped at two of the four weeks, or one session inside a
// three-day denominator reads as RELENTLESS.
const overShielded = computeTempo(steady2wk, NOW, {
  shieldCovers: ['2026-07-19', '2026-07-26', '2026-08-02', '2026-08-07'],
});
ok('protected days cap at 14', overShielded.protectedDays <= 14,
   `${overShielded.protectedDays}`);

// The banner on /now claimed "Tempo is re-based for this period" while
// computeTempo took no protection argument at all. It does now.
const raya = computeTempo(steady2wk, NOW, {
  calendar: [{ startISO: '2026-08-07', endISO: '2026-08-13' }],
});
eq('a calendar window discounts days too', raya.protectedDays, 7);

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
