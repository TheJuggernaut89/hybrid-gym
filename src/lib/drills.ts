import type { RegionId } from './anatomy';
import type { StatKey } from './types';
import { LM, angleAt, bandScore, midpoint, tracked, type Landmark } from './pose';

export interface DrillRuntime {
  /** Which half of the rep cycle we are in. */
  loaded: boolean;
  /** Used by alternating drills to require side changes between reps. */
  lastSide: 'L' | 'R' | null;
  reps: number;
  frames: number;
  scoreSum: number;
  /** Frames each region has spent flagged, so a single noisy frame can't flag a joint. */
  strainFrames: Partial<Record<RegionId, number>>;
}

export function newRuntime(): DrillRuntime {
  return { loaded: false, lastSide: null, reps: 0, frames: 0, scoreSum: 0, strainFrames: {} };
}

export interface FrameResult {
  score: number;
  cues: string[];
  repDelta: number;
  active: RegionId[];
  strain: RegionId[];
  /** False when the fighter is out of frame — the frame is skipped for scoring. */
  usable: boolean;
}

export interface Drill {
  id: string;
  name: string;
  brief: string;
  cameraNote: string;
  stat: StatKey;
  mode: 'reps' | 'hold';
  durationSec: number;
  targets: RegionId[];
  watch: RegionId[];
  evaluate: (lm: Landmark[], rt: DrillRuntime) => FrameResult;
}

const OUT_OF_FRAME: FrameResult = {
  score: 0,
  cues: ['STEP BACK — FULL BODY NOT IN FRAME'],
  repDelta: 0,
  active: [],
  strain: [],
  usable: false,
};

/** Flags a region only after it has been bad for `threshold` consecutive frames. */
function sustain(rt: DrillRuntime, region: RegionId, bad: boolean, threshold = 8): boolean {
  const current = rt.strainFrames[region] ?? 0;
  const next = bad ? current + 1 : Math.max(0, current - 2);
  rt.strainFrames[region] = next;
  return next >= threshold;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DRILL LIBRARY — all under 10 minutes to limit browser battery drain.
// ═══════════════════════════════════════════════════════════════════════════

const jabCross: Drill = {
  id: 'jab-cross',
  name: 'Jab–Cross Shadow',
  brief: 'Straight punches from a boxing stance. Retract fully. Guard never drops.',
  cameraNote: 'Phone at chest height, 2 m back, facing you square-on.',
  stat: 'craft',
  mode: 'reps',
  durationSec: 300,
  targets: ['shoulders', 'chest', 'triceps', 'abs', 'obliques'],
  watch: ['shoulders', 'neck'],
  evaluate(lm, rt) {
    const need = [
      LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW,
      LM.L_WRIST, LM.R_WRIST, LM.NOSE, LM.L_HIP, LM.R_HIP,
    ];
    if (!tracked(lm, need)) return OUT_OF_FRAME;

    const lElbow = angleAt(lm[LM.L_SHOULDER], lm[LM.L_ELBOW], lm[LM.L_WRIST]);
    const rElbow = angleAt(lm[LM.R_SHOULDER], lm[LM.R_ELBOW], lm[LM.R_WRIST]);

    const extendedSide: 'L' | 'R' | null =
      lElbow > 155 ? 'L' : rElbow > 155 ? 'R' : null;
    const bothRetracted = lElbow < 105 && rElbow < 105;

    let repDelta = 0;
    if (extendedSide && !rt.loaded) {
      // A rep only counts if it alternates or follows a full retraction.
      if (extendedSide !== rt.lastSide || rt.lastSide === null) {
        repDelta = 1;
        rt.lastSide = extendedSide;
      }
      rt.loaded = true;
    } else if (bothRetracted) {
      rt.loaded = false;
    }

    const cues: string[] = [];

    // Guard: the non-punching wrist should stay near chin height.
    const guardWrist = extendedSide === 'L' ? lm[LM.R_WRIST] : lm[LM.L_WRIST];
    const guardGap = guardWrist.y - lm[LM.NOSE].y; // smaller = higher guard
    const guardScore = bandScore(-guardGap, -0.22, 0.02);
    if (guardScore < 55) cues.push('GUARD HAND UP — CHIN IS EXPOSED');

    // Extension: full lockout without snapping past straight.
    const peak = Math.max(lElbow, rElbow);
    const extensionScore = peak > 172 ? 70 : bandScore(peak, 110, 160);
    if (peak < 140 && rt.frames > 30) cues.push('EXTEND THROUGH THE TARGET');
    if (peak > 175) cues.push('EASE OFF THE LOCKOUT — DO NOT SNAP THE ELBOW');

    // Stance: hips level, shoulders not shrugged.
    const hipTilt = Math.abs(lm[LM.L_HIP].y - lm[LM.R_HIP].y);
    const stanceScore = bandScore(-hipTilt, -0.09, -0.01);

    const shoulderMid = midpoint(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    const shrugging = lm[LM.NOSE].y - shoulderMid.y > -0.14;
    const shoulderStrain = sustain(rt, 'shoulders', shrugging);
    if (shoulderStrain) cues.push('DROP THE SHOULDERS — YOU ARE SHRUGGING');

    const score = Math.round(guardScore * 0.4 + extensionScore * 0.4 + stanceScore * 0.2);

    return {
      score,
      cues,
      repDelta,
      active: extendedSide ? ['shoulders', 'chest', 'triceps'] : ['abs', 'obliques'],
      strain: shoulderStrain ? ['shoulders'] : [],
      usable: true,
    };
  },
};

const fighterSquat: Drill = {
  id: 'fighter-squat',
  name: 'Fighter Squat',
  brief: 'Bodyweight squat to parallel. Chest tall, knees tracking over the toes.',
  cameraNote: 'Phone on the floor angled up, or on a chair. Stand side-on-ish, 2 m back.',
  stat: 'strength',
  mode: 'reps',
  durationSec: 240,
  targets: ['quads', 'glutes', 'hamstrings', 'abs'],
  watch: ['knees', 'lower_back'],
  evaluate(lm, rt) {
    const need = [
      LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP,
      LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE,
    ];
    if (!tracked(lm, need)) return OUT_OF_FRAME;

    const lKnee = angleAt(lm[LM.L_HIP], lm[LM.L_KNEE], lm[LM.L_ANKLE]);
    const rKnee = angleAt(lm[LM.R_HIP], lm[LM.R_KNEE], lm[LM.R_ANKLE]);
    const kneeAngle = (lKnee + rKnee) / 2;

    let repDelta = 0;
    if (kneeAngle < 100 && !rt.loaded) rt.loaded = true;
    else if (kneeAngle > 158 && rt.loaded) {
      rt.loaded = false;
      repDelta = 1;
    }

    const cues: string[] = [];

    // Depth: reward getting to parallel, don't punish the top of the rep.
    const depthScore = rt.loaded ? bandScore(-kneeAngle, -120, -85) : 100;
    if (rt.loaded && kneeAngle > 115) cues.push('DEEPER — HIT PARALLEL');

    // Torso: hip angle between shoulder and knee. Folding forward = lumbar load.
    const shoulderMid = midpoint(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    const hipMid = midpoint(lm[LM.L_HIP], lm[LM.R_HIP]);
    const kneeMid = midpoint(lm[LM.L_KNEE], lm[LM.R_KNEE]);
    const torsoAngle = angleAt(shoulderMid, hipMid, kneeMid);
    const torsoScore = bandScore(torsoAngle, 45, 85);

    const backStrain = sustain(rt, 'lower_back', rt.loaded && torsoAngle < 48);
    if (backStrain) cues.push('CHEST UP — YOUR LOWER BACK IS TAKING IT');

    // Valgus: knees collapsing inside the ankles.
    const kneeSpread = Math.abs(lm[LM.L_KNEE].x - lm[LM.R_KNEE].x);
    const ankleSpread = Math.abs(lm[LM.L_ANKLE].x - lm[LM.R_ANKLE].x);
    const valgus = ankleSpread > 0.02 && kneeSpread < ankleSpread * 0.72;
    const kneeStrain = sustain(rt, 'knees', rt.loaded && valgus);
    if (kneeStrain) cues.push('KNEES OUT — THEY ARE CAVING IN');

    const trackingScore = valgus ? 40 : 100;
    const score = Math.round(depthScore * 0.4 + torsoScore * 0.35 + trackingScore * 0.25);

    const strain: RegionId[] = [];
    if (backStrain) strain.push('lower_back');
    if (kneeStrain) strain.push('knees');

    return {
      score,
      cues,
      repDelta,
      active: rt.loaded ? ['quads', 'glutes'] : ['quads'],
      strain,
      usable: true,
    };
  },
};

const highKnees: Drill = {
  id: 'high-knees',
  name: 'High Knees',
  brief: 'Drive each knee above hip height. Stay tall, stay on the balls of your feet.',
  cameraNote: 'Phone at hip height, 2 m back, full body in frame.',
  stat: 'power',
  mode: 'reps',
  durationSec: 180,
  targets: ['quads', 'hip_flexors', 'calves', 'abs'],
  watch: ['knees', 'lower_back'],
  evaluate(lm, rt) {
    const need = [LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_SHOULDER, LM.R_SHOULDER];
    if (!tracked(lm, need)) return OUT_OF_FRAME;

    const hipMid = midpoint(lm[LM.L_HIP], lm[LM.R_HIP]);
    // Image y grows downward, so a knee above the hip has the smaller y.
    const lLift = hipMid.y - lm[LM.L_KNEE].y;
    const rLift = hipMid.y - lm[LM.R_KNEE].y;

    const side: 'L' | 'R' | null = lLift > 0 ? 'L' : rLift > 0 ? 'R' : null;
    const bothDown = lLift < -0.05 && rLift < -0.05;

    let repDelta = 0;
    if (side && !rt.loaded) {
      if (side !== rt.lastSide || rt.lastSide === null) {
        repDelta = 1;
        rt.lastSide = side;
      }
      rt.loaded = true;
    } else if (bothDown) {
      rt.loaded = false;
    }

    const cues: string[] = [];
    const bestLift = Math.max(lLift, rLift);
    const liftScore = bandScore(bestLift, -0.06, 0.04);
    if (liftScore < 50 && rt.frames > 40) cues.push('KNEES HIGHER — ABOVE THE HIP');

    // Leaning back to cheat the lift.
    const shoulderMid = midpoint(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    const lean = Math.abs(shoulderMid.x - hipMid.x);
    const postureScore = bandScore(-lean, -0.12, -0.02);
    const backStrain = sustain(rt, 'lower_back', lean > 0.13);
    if (backStrain) cues.push('STOP LEANING BACK — STAY STACKED');

    const score = Math.round(liftScore * 0.6 + postureScore * 0.4);

    return {
      score,
      cues,
      repDelta,
      active: ['quads', 'hip_flexors', 'calves'],
      strain: backStrain ? ['lower_back'] : [],
      usable: true,
    };
  },
};

const pushUp: Drill = {
  id: 'push-up',
  name: 'Combat Push-Up',
  brief: 'Chest to fist height. One straight line from skull to heel.',
  cameraNote: 'Phone on the floor, side-on to your body, 2 m away.',
  stat: 'strength',
  mode: 'reps',
  durationSec: 240,
  targets: ['chest', 'triceps', 'shoulders', 'abs'],
  watch: ['lower_back', 'shoulders'],
  evaluate(lm, rt) {
    const need = [
      LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW,
      LM.L_WRIST, LM.R_WRIST, LM.L_HIP, LM.R_HIP, LM.L_ANKLE, LM.R_ANKLE,
    ];
    if (!tracked(lm, need, 0.4)) return OUT_OF_FRAME;

    const lElbow = angleAt(lm[LM.L_SHOULDER], lm[LM.L_ELBOW], lm[LM.L_WRIST]);
    const rElbow = angleAt(lm[LM.R_SHOULDER], lm[LM.R_ELBOW], lm[LM.R_WRIST]);
    const elbow = (lElbow + rElbow) / 2;

    let repDelta = 0;
    if (elbow < 100 && !rt.loaded) rt.loaded = true;
    else if (elbow > 158 && rt.loaded) {
      rt.loaded = false;
      repDelta = 1;
    }

    const cues: string[] = [];
    const depthScore = rt.loaded ? bandScore(-elbow, -110, -80) : 100;
    if (rt.loaded && elbow > 110) cues.push('LOWER — CHEST TO FIST HEIGHT');

    // Body line: shoulder → hip → ankle should be near 180°.
    const shoulderMid = midpoint(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    const hipMid = midpoint(lm[LM.L_HIP], lm[LM.R_HIP]);
    const ankleMid = midpoint(lm[LM.L_ANKLE], lm[LM.R_ANKLE]);
    const lineAngle = angleAt(shoulderMid, hipMid, ankleMid);
    const lineScore = bandScore(lineAngle, 140, 172);

    const sagging = lineAngle < 152;
    const backStrain = sustain(rt, 'lower_back', sagging);
    if (backStrain) cues.push('HIPS ARE SAGGING — SQUEEZE THE GLUTES');

    const score = Math.round(depthScore * 0.45 + lineScore * 0.55);

    return {
      score,
      cues,
      repDelta,
      active: rt.loaded ? ['chest', 'triceps', 'shoulders'] : ['chest', 'abs'],
      strain: backStrain ? ['lower_back'] : [],
      usable: true,
    };
  },
};

const plankHold: Drill = {
  id: 'plank-hold',
  name: 'Fight Plank',
  brief: 'Forearm plank. Hold the line. Breathe through it.',
  cameraNote: 'Phone on the floor, side-on, full body in frame.',
  stat: 'engine',
  mode: 'hold',
  durationSec: 120,
  targets: ['abs', 'obliques', 'glutes', 'shoulders'],
  watch: ['lower_back'],
  evaluate(lm, rt) {
    const need = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_ANKLE, LM.R_ANKLE];
    if (!tracked(lm, need, 0.4)) return OUT_OF_FRAME;

    const shoulderMid = midpoint(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]);
    const hipMid = midpoint(lm[LM.L_HIP], lm[LM.R_HIP]);
    const ankleMid = midpoint(lm[LM.L_ANKLE], lm[LM.R_ANKLE]);
    const lineAngle = angleAt(shoulderMid, hipMid, ankleMid);

    const cues: string[] = [];
    const lineScore = bandScore(lineAngle, 138, 174);

    const sagging = lineAngle < 155;
    const piking = hipMid.y < shoulderMid.y - 0.06;
    const backStrain = sustain(rt, 'lower_back', sagging);

    if (backStrain) cues.push('HIPS DROPPING — BRACE THE MIDLINE');
    if (piking) cues.push('HIPS TOO HIGH — YOU ARE RESTING, NOT PLANKING');

    const score = Math.round(piking ? Math.min(lineScore, 55) : lineScore);

    return {
      score,
      cues,
      repDelta: 0,
      active: ['abs', 'obliques', 'glutes'],
      strain: backStrain ? ['lower_back'] : [],
      usable: true,
    };
  },
};

export const DRILLS: Drill[] = [jabCross, fighterSquat, highKnees, pushUp, plankHold];

export function getDrill(id: string): Drill {
  return DRILLS.find((d) => d.id === id) ?? DRILLS[0];
}
