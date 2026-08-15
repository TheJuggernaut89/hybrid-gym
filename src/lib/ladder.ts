/**
 * THE COACHING LADDER — feedback that withdraws as you get better.
 *
 * Every other app cues harder the longer you use it. That produces dependency:
 * you perform well *while being corrected* and worse the moment the cues stop.
 * The ladder inverts it. Feedback fades across four stages, and a technique is
 * not considered learned until you can do it clean with the coach silent.
 *
 *   ACQUIRE       cue every rep
 *   BANDWIDTH     cue only when you fall outside tolerance
 *   SUMMARY       silent during the set, full report afterwards
 *   SILENT PROBE  no cues, no running score — a retention test
 *   MASTERED      earned by passing a probe; decays if it stops holding
 *
 * The general principle (constant feedback aids performance but harms retention;
 * faded and bandwidth feedback improve it) comes from the motor-learning
 * literature. The specific thresholds below are *product* choices, tuned to feel
 * right, not values taken from any study — they should be calibrated against
 * real sessions before anyone claims otherwise.
 */

export type LadderStage =
  | 'ACQUIRE'
  | 'BANDWIDTH'
  | 'SUMMARY'
  | 'SILENT_PROBE'
  | 'MASTERED';

export const STAGE_ORDER: LadderStage[] = [
  'ACQUIRE',
  'BANDWIDTH',
  'SUMMARY',
  'SILENT_PROBE',
  'MASTERED',
];

export const STAGE_META: Record<
  LadderStage,
  { label: string; blurb: string; cuePolicy: string }
> = {
  ACQUIRE: {
    label: 'Acquire',
    blurb: 'Learning the shape. Every fault gets called.',
    cuePolicy: 'Every cue, every rep.',
  },
  BANDWIDTH: {
    label: 'Bandwidth',
    blurb: 'You have the shape. Only real deviations get called now.',
    cuePolicy: 'Cues only when you drop outside tolerance.',
  },
  SUMMARY: {
    label: 'Summary',
    blurb: 'Silent while you work. Full report at the end.',
    cuePolicy: 'No live cues. Debrief afterwards.',
  },
  SILENT_PROBE: {
    label: 'Silent probe',
    blurb: 'No cues, no running score. This is the retention test.',
    cuePolicy: 'Nothing. You are on your own — that is the point.',
  },
  MASTERED: {
    label: 'Mastered',
    blurb: 'Held clean with the coach silent. Spot-checked from here.',
    cuePolicy: 'Silent. Occasional spot check.',
  },
};

/** Score a session must reach to count as clean at each stage. */
export const STAGE_BAR: Record<LadderStage, number> = {
  ACQUIRE: 70,
  BANDWIDTH: 78,
  SUMMARY: 82,
  SILENT_PROBE: 80,
  MASTERED: 70,
};

/** Consecutive clean sessions needed to move up. */
export const STAGE_RUN: Record<LadderStage, number> = {
  ACQUIRE: 2,
  BANDWIDTH: 2,
  SUMMARY: 2,
  SILENT_PROBE: 1,
  MASTERED: 1,
};

/** How far below the bar counts as a genuine regression, not a bad night. */
const REGRESSION_MARGIN = 15;

export interface TechniqueProgress {
  drillId: string;
  stage: LadderStage;
  /** Consecutive clean sessions at the current stage. */
  cleanRun: number;
  probesPassed: number;
  probesFailed: number;
  bestScore: number;
  lastScore: number | null;
  sessions: number;
}

export function newProgress(drillId: string): TechniqueProgress {
  return {
    drillId,
    stage: 'ACQUIRE',
    cleanRun: 0,
    probesPassed: 0,
    probesFailed: 0,
    bestScore: 0,
    lastScore: null,
    sessions: 0,
  };
}

export type LadderEvent =
  | 'promoted'
  | 'demoted'
  | 'held'
  | 'probe_passed'
  | 'probe_failed'
  | 'mastery_lost';

export interface LadderResult {
  progress: TechniqueProgress;
  event: LadderEvent;
  /** Line shown on the post-session screen. */
  message: string;
}

function stepStage(stage: LadderStage, dir: 1 | -1): LadderStage {
  const i = STAGE_ORDER.indexOf(stage);
  const next = Math.min(STAGE_ORDER.length - 1, Math.max(0, i + dir));
  return STAGE_ORDER[next];
}

/** Applies one completed session to a technique's progress. */
export function applySession(
  prev: TechniqueProgress,
  score: number,
): LadderResult {
  const s = Math.round(Math.min(100, Math.max(0, score)));
  const base: TechniqueProgress = {
    ...prev,
    sessions: prev.sessions + 1,
    lastScore: s,
    bestScore: Math.max(prev.bestScore, s),
  };

  const bar = STAGE_BAR[prev.stage];

  // ── the probe: pass or fail, no partial credit ──────────────────────────
  if (prev.stage === 'SILENT_PROBE') {
    if (s >= bar) {
      return {
        progress: { ...base, stage: 'MASTERED', cleanRun: 0, probesPassed: prev.probesPassed + 1 },
        event: 'probe_passed',
        message: `Probe passed at ${s}% with no cues. That is the one that counts — technique mastered.`,
      };
    }
    return {
      progress: { ...base, stage: 'SUMMARY', cleanRun: 0, probesFailed: prev.probesFailed + 1 },
      event: 'probe_failed',
      message: `Probe came in at ${s}%. The cues were carrying more than it looked. Back to summary feedback.`,
    };
  }

  // ── mastery has to keep holding ─────────────────────────────────────────
  if (prev.stage === 'MASTERED') {
    if (s < bar) {
      return {
        progress: { ...base, stage: 'SUMMARY', cleanRun: 0 },
        event: 'mastery_lost',
        message: `${s}% — mastery does not hold on trust. Back to summary feedback until it is clean again.`,
      };
    }
    return { progress: { ...base, cleanRun: 0 }, event: 'held', message: `Spot check clean at ${s}%.` };
  }

  // ── climbing ────────────────────────────────────────────────────────────
  if (s >= bar) {
    const cleanRun = prev.cleanRun + 1;
    if (cleanRun >= STAGE_RUN[prev.stage]) {
      const next = stepStage(prev.stage, 1);
      return {
        progress: { ...base, stage: next, cleanRun: 0 },
        event: 'promoted',
        message:
          next === 'SILENT_PROBE'
            ? `Two clean sessions at ${bar}%+. Next one is a silent probe — no cues, no live score.`
            : `Promoted to ${STAGE_META[next].label}. ${STAGE_META[next].cuePolicy}`,
      };
    }
    return {
      progress: { ...base, cleanRun },
      event: 'held',
      message: `${s}% — clean. One more like that and the cues step back.`,
    };
  }

  // ── falling ─────────────────────────────────────────────────────────────
  if (s < bar - REGRESSION_MARGIN && prev.stage !== 'ACQUIRE') {
    const next = stepStage(prev.stage, -1);
    return {
      progress: { ...base, stage: next, cleanRun: 0 },
      event: 'demoted',
      message: `${s}% is well off the bar. Dropping to ${STAGE_META[next].label} — more feedback, not less.`,
    };
  }

  return {
    progress: { ...base, cleanRun: 0 },
    event: 'held',
    message: `${s}% — under the ${bar}% bar. Run stays at zero.`,
  };
}

/* ── what the live session is allowed to show ───────────────────────────── */

export interface CuePolicy {
  /** Render form cues during the set. */
  liveCues: boolean;
  /** Render the running form score. */
  liveScore: boolean;
  /** Render the full breakdown afterwards. */
  postReport: boolean;
  /** Only surface cues once the score drops below this. */
  cueThreshold: number | null;
}

export function cuePolicy(stage: LadderStage): CuePolicy {
  switch (stage) {
    case 'ACQUIRE':
      return { liveCues: true, liveScore: true, postReport: true, cueThreshold: null };
    case 'BANDWIDTH':
      // Only speak up outside tolerance — that is the whole idea of the stage.
      return { liveCues: true, liveScore: true, postReport: true, cueThreshold: STAGE_BAR.BANDWIDTH };
    case 'SUMMARY':
      return { liveCues: false, liveScore: true, postReport: true, cueThreshold: null };
    case 'SILENT_PROBE':
      // No score either: a visible number is itself a form of feedback.
      return { liveCues: false, liveScore: false, postReport: true, cueThreshold: null };
    case 'MASTERED':
      return { liveCues: false, liveScore: true, postReport: true, cueThreshold: null };
  }
}

/** Strain warnings ignore the ladder entirely — safety is never faded out. */
export function alwaysShowStrain(): true {
  return true;
}

export function stageIndex(stage: LadderStage): number {
  return STAGE_ORDER.indexOf(stage);
}
