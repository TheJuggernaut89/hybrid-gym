/**
 * form engine, pose maths and XP
 *
 * Ported from the throwaway Node harness used during the build. These run
 * against src/lib directly, so they fail if the logic drifts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { getDrill, newRuntime } from '../drills';
import { angleAt, midpoint, LM } from '../pose';
import { levelForXp, xpAtLevel, xpFromOcr, xpFromHome, levelProgress } from '../xp';
import { classify } from '../corrective';
const aa = angleAt;
const mid = midpoint;

test("form engine, pose maths and XP", () => {
let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const ok = (name: string, cond: unknown, info?: string) => {
  cond ? pass++ : fail++;
  if (!cond) console.log(`FAIL ${name}${info ? ' :: ' + info : ''}`);
};
// XP is now session load (duration x RPE), not calories. These assert the
// PROPERTY that matters — modality fairness — not the formula shape.
eq('xpFromOcr uses duration+RPE', xpFromOcr({ activeMinutes: 15 }), 15 * 6);
eq('xpFromHome scales by quality', xpFromHome({ accuracy: 80, durationSeconds: 300 }), 29);
// The inversion the old formula caused: an easy half hour of cardio used to
// outscore an hour of hard class work (510 vs 0). It must not any more.
ok('hard hour beats easy half-hour', xpFromOcr({ activeMinutes: 60, rpe: 8 }) > xpFromOcr({ activeMinutes: 30, rpe: 3 }));
ok('a five-minute drill cannot outearn an hour', xpFromHome({ accuracy: 100, durationSeconds: 300 }) < xpFromOcr({ activeMinutes: 60, rpe: 6 }));


// ── angle math ──────────────────────────────────────────────────────────────
const p = (x, y) => ({ x, y, z: 0, visibility: 1 });
eq('angle straight', Math.round(angleAt(p(0, 0), p(1, 0), p(2, 0))), 180);
eq('angle right', Math.round(angleAt(p(0, 0), p(0, 1), p(1, 1))), 90);
eq('angle folded', Math.round(angleAt(p(0, 0), p(1, 0), p(0, 0.001))), 0);

// ── XP + level curve (spec formulas) ─────────────────────────────────────────

eq('level @0', levelForXp(0), 1);
eq('level @100', levelForXp(100), 2);
eq('level @10000', levelForXp(10000), 11);
eq('xpAtLevel inverse', levelForXp(xpAtLevel(15)), 15);
ok('level boundary exact', levelForXp(xpAtLevel(15) - 1) === 14, `got ${levelForXp(xpAtLevel(15) - 1)}`);
const lp = levelProgress(13240);
eq('progress@13240', [lp.level, lp.intoLevel, lp.levelSpan], [12, 1140, 2300]);

// ── squat rep counting ───────────────────────────────────────────────────────
// Build a body whose knee angle we control directly.
/**
 * Builds a squat pose with the hip-knee-ankle angle set to `kneeAngleDeg` and
 * the shoulder-hip-knee (torso) angle set to `torsoAngleDeg`, both exactly.
 */
function squatPose(kneeAngleDeg, torsoAngleDeg = 90, valgus = false) {
  const lm = [];
  for (let i = 0; i < 33; i++) lm[i] = p(0.5, 0.5);
  const rad = (kneeAngleDeg * Math.PI) / 180;
  lm[LM.L_KNEE] = p(0.45, 0.7);  lm[LM.R_KNEE] = p(0.55, 0.7);
  lm[LM.L_ANKLE] = p(valgus ? 0.45 : 0.42, 0.9); lm[LM.R_ANKLE] = p(valgus ? 0.55 : 0.58, 0.9);
  if (valgus) { lm[LM.L_KNEE] = p(0.48, 0.7); lm[LM.R_KNEE] = p(0.52, 0.7); }

  // hips: rotate the knee->ankle vector by kneeAngleDeg
  const ankle = lm[LM.L_ANKLE], knee = lm[LM.L_KNEE];
  const baseAng = Math.atan2(ankle.y - knee.y, ankle.x - knee.x);
  const target = baseAng - rad;
  lm[LM.L_HIP] = p(knee.x + Math.cos(target) * 0.2, knee.y + Math.sin(target) * 0.2);
  lm[LM.R_HIP] = p(lm[LM.L_HIP].x + 0.1, lm[LM.L_HIP].y);

  // shoulders: rotate the hip->knee vector by torsoAngleDeg
  const hipMid = { x: (lm[LM.L_HIP].x + lm[LM.R_HIP].x) / 2, y: (lm[LM.L_HIP].y + lm[LM.R_HIP].y) / 2 };
  const kneeMid = { x: (lm[LM.L_KNEE].x + lm[LM.R_KNEE].x) / 2, y: (lm[LM.L_KNEE].y + lm[LM.R_KNEE].y) / 2 };
  const hkAng = Math.atan2(kneeMid.y - hipMid.y, kneeMid.x - hipMid.x);
  const shAng = hkAng + (torsoAngleDeg * Math.PI) / 180;
  const shMid = { x: hipMid.x + Math.cos(shAng) * 0.25, y: hipMid.y + Math.sin(shAng) * 0.25 };
  lm[LM.L_SHOULDER] = p(shMid.x - 0.05, shMid.y);
  lm[LM.R_SHOULDER] = p(shMid.x + 0.05, shMid.y);
  return lm;
}

const squat = getDrill('fighter-squat');
const rt = newRuntime();
let reps = 0;
const measured = [];
for (const target of [170, 90, 170, 90, 170]) {
  const lm = squatPose(target);
  const r = squat.evaluate(lm, rt);
  measured.push(Math.round(angleAt(lm[LM.L_HIP], lm[LM.L_KNEE], lm[LM.L_ANKLE])));
  reps += r.repDelta;
}
eq('squat synthetic angles', measured, [170, 90, 170, 90, 170]);
eq('squat rep count (2 full cycles)', reps, 2);

// half rep must not count
const rt2 = newRuntime();
let halfReps = 0;
for (const t of [170, 120, 170]) halfReps += squat.evaluate(squatPose(t), rt2).repDelta;
eq('squat half-rep ignored', halfReps, 0);

// sanity: the synthetic pose really does hit the requested torso angle
{
  
  
  const lm = squatPose(90, 40);
  const sh = mid(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
  const hp = mid(lm[LM.L_HIP], lm[LM.R_HIP]);
  const kn = mid(lm[LM.L_KNEE], lm[LM.R_KNEE]);
  eq('synthetic torso angle == 40', Math.round(aa(sh, hp, kn)), 40);
}

// strain: sustained forward fold (torso 40 deg) flags lower_back after 8 frames
const rt3 = newRuntime();
let flagged = null;
for (let i = 0; i < 15; i++) {
  const r = squat.evaluate(squatPose(90, 40), rt3);
  if (r.strain.includes('lower_back')) { flagged = i; break; }
}
ok('squat flags lower_back on sustained fold', flagged !== null && flagged >= 7, `frame=${flagged}`);

// upright torso must never flag
const rtUp = newRuntime();
let uprightFlag = false;
for (let i = 0; i < 20; i++) {
  if (squat.evaluate(squatPose(90, 85), rtUp).strain.includes('lower_back')) uprightFlag = true;
}
eq('upright squat never flags', uprightFlag, false);

// a single bad frame must NOT flag
const rt4 = newRuntime();
const single = squat.evaluate(squatPose(90, 40), rt4);
eq('single bad frame does not flag', single.strain, []);

// valgus knees flag after sustained frames
const rtV = newRuntime();
let valgusFlagged = false;
for (let i = 0; i < 15; i++) {
  if (squat.evaluate(squatPose(90, 85, true), rtV).strain.includes('knees')) { valgusFlagged = true; break; }
}
eq('valgus flags knees', valgusFlagged, true);

// out-of-frame guard
const rt5 = newRuntime();
const empty = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
const oof = squat.evaluate(empty, rt5);
eq('out of frame unusable', [oof.usable, oof.repDelta], [false, 0]);

// ── jab alternation: same arm twice must not double-count ────────────────────
const jab = getDrill('jab-cross');
function jabPose(extended /* 'L' | 'R' | null */) {
  const lm = [];
  for (let i = 0; i < 33; i++) lm[i] = p(0.5, 0.5);
  lm[LM.NOSE] = p(0.5, 0.2);
  lm[LM.L_SHOULDER] = p(0.4, 0.35); lm[LM.R_SHOULDER] = p(0.6, 0.35);
  lm[LM.L_HIP] = p(0.42, 0.6); lm[LM.R_HIP] = p(0.58, 0.6);
  // retracted arm: elbow angle ~60 ; extended: ~180
  const arm = (side, ext) => {
    const sh = side === 'L' ? lm[LM.L_SHOULDER] : lm[LM.R_SHOULDER];
    const el = { x: sh.x, y: sh.y + 0.12, z: 0, visibility: 1 };
    const wr = ext
      ? { x: sh.x, y: sh.y + 0.24, z: 0, visibility: 1 }          // straight -> 180
      : { x: sh.x + 0.1, y: sh.y + 0.04, z: 0, visibility: 1 };   // bent
    if (side === 'L') { lm[LM.L_ELBOW] = el; lm[LM.L_WRIST] = wr; }
    else { lm[LM.R_ELBOW] = el; lm[LM.R_WRIST] = wr; }
  };
  arm('L', extended === 'L'); arm('R', extended === 'R');
  return lm;
}
const jrt = newRuntime();
let jabReps = 0;
for (const s of ['L', null, 'L', null, 'R', null]) jabReps += jab.evaluate(jabPose(s), jrt).repDelta;
ok('jab counts alternating only', jabReps === 2, `got ${jabReps} (L,L,R -> L then R)`);

// ── fatigue vs failure classification ───────────────────────────────────────
eq('quads on squat = fatigue', classify('quads', squat), 'fatigue');
eq('knees on squat = failure', classify('knees', squat), 'failure');
eq('lower_back on squat = failure', classify('lower_back', squat), 'failure');
eq('shoulders on squat = failure (joint)', classify('shoulders', squat), 'failure');
eq('chest on jab = fatigue', classify('chest', jab), 'fatigue');
eq('neck on jab = failure', classify('neck', jab), 'failure');
eq('shoulders on jab = failure (watched)', classify('shoulders', jab), 'failure');

// The harness tallies rather than throws, so without this the suite
// reports green no matter what the assertions above found.
assert.equal(fail, 0, `${fail} of ${pass + fail} assertions failed — see the FAIL lines above`);
assert.ok(pass > 0, 'suite ran no assertions at all');
});
