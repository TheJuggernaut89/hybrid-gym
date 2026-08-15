/**
 * coaching ladder
 *
 * Ported from the throwaway Node harness used during the build. These run
 * against src/lib directly, so they fail if the logic drifts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { newProgress, applySession, cuePolicy, STAGE_BAR, STAGE_ORDER, stageIndex, } from '../ladder';

test("coaching ladder", () => {
let pass = 0, fail = 0;
const eq = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const ok = (n: string, cond: unknown, info?: string) => { cond ? pass++ : fail++; if (!cond) console.log(`FAIL ${n}${info?' :: '+info:''}`); };

const run = (scores, start = newProgress('squat')) => {
  let p = start, last = null;
  for (const s of scores) { last = applySession(p, s); p = last.progress; }
  return { p, last };
};

// ── start state ─────────────────────────────────────────────────────────────
const fresh = newProgress('squat');
eq('starts at ACQUIRE', fresh.stage, 'ACQUIRE');
eq('starts with no run', fresh.cleanRun, 0);
eq('starts with no sessions', fresh.sessions, 0);

// ── climbing the ladder ─────────────────────────────────────────────────────
const one = applySession(fresh, 75);
eq('one clean session does not promote', one.progress.stage, 'ACQUIRE');
eq('one clean session builds the run', one.progress.cleanRun, 1);
eq('held event', one.event, 'held');

const two = run([75, 75]);
eq('two clean sessions promote', two.p.stage, 'BANDWIDTH');
eq('promotion resets the run', two.p.cleanRun, 0);
eq('promoted event', two.last.event, 'promoted');

// full climb: ACQUIRE -> BANDWIDTH -> SUMMARY -> SILENT_PROBE
const climb = run([75, 75, 80, 80, 85, 85]);
eq('full climb reaches the probe', climb.p.stage, 'SILENT_PROBE');
ok('probe promotion is announced', /silent probe/i.test(climb.last.message), climb.last.message);

// ── the probe decides mastery ───────────────────────────────────────────────
const passed = run([75, 75, 80, 80, 85, 85, 88]);
eq('passing the probe masters it', passed.p.stage, 'MASTERED');
eq('probe pass counted', passed.p.probesPassed, 1);
eq('probe_passed event', passed.last.event, 'probe_passed');

const failed = run([75, 75, 80, 80, 85, 85, 61]);
eq('failing the probe drops to SUMMARY', failed.p.stage, 'SUMMARY');
eq('probe fail counted', failed.p.probesFailed, 1);
eq('probe_failed event', failed.last.event, 'probe_failed');
ok('probe failure explains itself', /cues were carrying/i.test(failed.last.message));

// A probe just under the bar is still a fail — no partial credit.
const nearMiss = run([75, 75, 80, 80, 85, 85, STAGE_BAR.SILENT_PROBE - 1]);
eq('probe near-miss still fails', nearMiss.p.stage, 'SUMMARY');
const exact = run([75, 75, 80, 80, 85, 85, STAGE_BAR.SILENT_PROBE]);
eq('probe exactly on the bar passes', exact.p.stage, 'MASTERED');

// ── mastery has to keep holding ─────────────────────────────────────────────
const decayed = run([75, 75, 80, 80, 85, 85, 88, 55]);
eq('mastery decays on a bad session', decayed.p.stage, 'SUMMARY');
eq('mastery_lost event', decayed.last.event, 'mastery_lost');
const heldMastery = run([75, 75, 80, 80, 85, 85, 88, 90]);
eq('mastery holds when clean', heldMastery.p.stage, 'MASTERED');
eq('held event on spot check', heldMastery.last.event, 'held');

// ── regression ──────────────────────────────────────────────────────────────
// At BANDWIDTH (bar 78), a 60 is more than 15 under -> demote.
const demoted = run([75, 75, 60]);
eq('well below the bar demotes', demoted.p.stage, 'ACQUIRE');
eq('demoted event', demoted.last.event, 'demoted');

// A near miss is a bad night, not a regression.
const nearMissHold = run([75, 75, 70]);
eq('near miss holds the stage', nearMissHold.p.stage, 'BANDWIDTH');
eq('near miss zeroes the run', nearMissHold.p.cleanRun, 0);

// ACQUIRE is the floor — you cannot fall off the bottom.
const floorTest = run([10, 10, 10]);
eq('ACQUIRE is the floor', floorTest.p.stage, 'ACQUIRE');

// A broken run has to be rebuilt from zero.
const rebuild = run([75, 40, 75, 75]);
eq('run rebuilds after a break', rebuild.p.stage, 'BANDWIDTH');

// ── bookkeeping ─────────────────────────────────────────────────────────────
const book = run([75, 40, 88, 62]);
eq('sessions counted', book.p.sessions, 4);
eq('best score tracked', book.p.bestScore, 88);
eq('last score tracked', book.p.lastScore, 62);
ok('scores clamped to 0-100', applySession(fresh, 500).progress.lastScore === 100);
ok('negative scores clamped', applySession(fresh, -20).progress.lastScore === 0);

// ── cue policy: the actual point of the feature ─────────────────────────────
eq('ACQUIRE cues everything', cuePolicy('ACQUIRE'),
   { liveCues: true, liveScore: true, postReport: true, cueThreshold: null });
ok('BANDWIDTH gates cues on a threshold', cuePolicy('BANDWIDTH').cueThreshold === STAGE_BAR.BANDWIDTH);
ok('SUMMARY silences live cues', cuePolicy('SUMMARY').liveCues === false);
ok('SUMMARY keeps the score', cuePolicy('SUMMARY').liveScore === true);
ok('PROBE silences cues', cuePolicy('SILENT_PROBE').liveCues === false);
ok('PROBE also hides the score', cuePolicy('SILENT_PROBE').liveScore === false,
   'a visible score is itself feedback — it must go during a probe');
ok('every stage still reports afterwards', STAGE_ORDER.every(s => cuePolicy(s).postReport === true));

// feedback must be monotonically non-increasing up the ladder
const cueLevel = (s) => (cuePolicy(s).liveCues ? 2 : 0) + (cuePolicy(s).liveScore ? 1 : 0);
const levels = ['ACQUIRE','BANDWIDTH','SUMMARY','SILENT_PROBE'].map(cueLevel);
ok('feedback fades monotonically up the ladder',
   levels.every((v, i) => i === 0 || v <= levels[i - 1]), levels.join(' -> '));

eq('stage order indexes correctly', stageIndex('MASTERED'), 4);

// The harness tallies rather than throws, so without this the suite
// reports green no matter what the assertions above found.
assert.equal(fail, 0, `${fail} of ${pass + fail} assertions failed — see the FAIL lines above`);
assert.ok(pass > 0, 'suite ran no assertions at all');
});
