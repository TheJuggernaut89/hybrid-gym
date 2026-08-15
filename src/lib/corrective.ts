import { JOINT_REGIONS, REGION_LABEL, type RegionId } from './anatomy';
import type { Drill } from './drills';

export type Verdict = 'fatigue' | 'failure';

export interface Corrective {
  title: string;
  durationSec: number;
  steps: string[];
}

/**
 * Fatigue vs Failure.
 *
 * Fatigue = the muscle the drill was built to load is burning. Expected, healthy,
 * no intervention.
 *
 * Failure = a joint is complaining, or a muscle that had no business working is
 * doing the work. That means the movement pattern broke down, so we intercept the
 * loop and queue a corrective before the fighter goes again.
 */
export function classify(region: RegionId, drill: Drill): Verdict {
  if (JOINT_REGIONS.includes(region)) return 'failure';
  if (drill.watch.includes(region)) return 'failure';
  if (drill.targets.includes(region)) return 'fatigue';
  return 'failure';
}

export function verdictCopy(verdict: Verdict, region: RegionId, drill: Drill): string {
  const label = REGION_LABEL[region].toLowerCase();
  if (verdict === 'fatigue') {
    return `That is fatigue. Your ${label} is exactly what ${drill.name} was built to cook. Burn is the receipt — keep going.`;
  }
  if (JOINT_REGIONS.includes(region)) {
    return `That is failure, not fatigue. Joints do not "burn" — your ${label} is absorbing load the muscles should be taking. Run the corrective before the next set.`;
  }
  return `That is failure, not fatigue. Your ${label} should not be the loudest thing after ${drill.name}. Something compensated. Fix it now.`;
}

const CORRECTIVES: Record<RegionId, Corrective> = {
  lower_back: {
    title: 'Cat-Cow + Hip Flexor Opener',
    durationSec: 120,
    steps: [
      'On all fours. 10 slow cat-cows — arch on the inhale, round on the exhale.',
      'Half-kneeling lunge, back knee down. Tuck the pelvis under, then lean forward. 30 s each side.',
      'Lie on your back, both knees to chest, rock side to side for 20 s.',
    ],
  },
  knees: {
    title: 'Knee Tracking Reset',
    durationSec: 120,
    steps: [
      'Seated. Straighten one leg and squeeze the quad hard for 5 s. 8 reps each side.',
      'Stand, feet hip-width. Slow quarter-squats, driving the knees out over the toes. 15 reps.',
      'Calf raises, 20 slow reps — a stiff ankle forces the knee to compensate.',
    ],
  },
  shoulders: {
    title: 'Shoulder Decompression',
    durationSec: 120,
    steps: [
      'Arms at your sides. Roll the shoulders back and down, 15 slow circles.',
      'Wall slides: forearms flat on the wall, slide up and down. 12 reps.',
      'Doorway pec stretch, forearm on the frame, step through. 30 s each side.',
    ],
  },
  rear_delts: {
    title: 'Posterior Shoulder Release',
    durationSec: 120,
    steps: [
      'Cross-body arm stretch, 30 s each side.',
      'Band or towel pull-aparts, 15 slow reps.',
      'Prone Y-raises face down on the floor, 12 reps.',
    ],
  },
  neck: {
    title: 'Neck De-Shrug',
    durationSec: 120,
    steps: [
      'Chin tucks — pull the head straight back, hold 3 s. 10 reps.',
      'Ear to shoulder, hand resting on your head for weight. 30 s each side.',
      'Shoulder rolls, 15 backward. If you were shrugging while punching, this is why.',
    ],
  },
  traps: {
    title: 'Upper Trap Downshift',
    durationSec: 120,
    steps: [
      'Shrug hard for 5 s, then let go completely. 8 reps — teaches the release.',
      'Ear-to-shoulder stretch, 30 s each side.',
      'Scapular depressions: sit, push hands into the floor, drive shoulders down. 12 reps.',
    ],
  },
  hip_flexors: {
    title: 'Hip Flexor Length',
    durationSec: 120,
    steps: [
      'Half-kneeling lunge with a posterior pelvic tilt. 45 s each side.',
      'Standing knee-to-chest hold, 20 s each side.',
      'Glute bridges, 15 reps — a tight flexor usually means a sleeping glute.',
    ],
  },
  quads: {
    title: 'Quad Flush',
    durationSec: 120,
    steps: [
      'Standing quad stretch, heel to glute, 30 s each side.',
      "Couch stretch against a wall if you have space, 30 s each side.",
      'Walk it out for 30 s. Do not sit down straight away.',
    ],
  },
  hamstrings: {
    title: 'Hamstring Decompression',
    durationSec: 120,
    steps: [
      'Standing forward fold with soft knees, 30 s.',
      'Single-leg hamstring stretch, heel on a low step. 30 s each side.',
      'Supine leg lowers, 10 slow reps each side.',
    ],
  },
  glutes: {
    title: 'Glute Release',
    durationSec: 120,
    steps: [
      'Figure-4 stretch on your back, 40 s each side.',
      'Pigeon pose if your hips allow, 30 s each side.',
      'Glute bridges, 15 reps with a 2 s squeeze at the top.',
    ],
  },
  calves: {
    title: 'Calf & Ankle Reset',
    durationSec: 120,
    steps: [
      'Wall calf stretch, back leg straight. 40 s each side.',
      'Repeat with the back knee bent to hit the soleus. 30 s each side.',
      'Ankle circles, 10 each direction.',
    ],
  },
  shins: {
    title: 'Shin Splint Prevention',
    durationSec: 120,
    steps: [
      'Kneel and sit back on your heels to stretch the shins. 40 s.',
      'Toe raises against a wall, 20 slow reps.',
      'Ankle alphabet — trace A to J with each foot.',
    ],
  },
  chest: {
    title: 'Chest Opener',
    durationSec: 120,
    steps: [
      'Doorway pec stretch at three heights, 20 s each.',
      'Floor angels lying on your back, 12 reps.',
      'Thread-the-needle rotation, 30 s each side.',
    ],
  },
  lats: {
    title: 'Lat Lengthener',
    durationSec: 120,
    steps: [
      'Overhead side bend, 30 s each side.',
      'Child’s pose with hands walked to one side, 30 s each side.',
      'Hang from a bar if you have one, 20 s.',
    ],
  },
  biceps: {
    title: 'Biceps & Elbow Flush',
    durationSec: 120,
    steps: [
      'Arm straight, palm on a wall behind you, rotate away. 30 s each side.',
      'Slow full-range elbow extensions, 15 reps.',
      'Shake the arms out for 20 s.',
    ],
  },
  triceps: {
    title: 'Triceps Release',
    durationSec: 120,
    steps: [
      'Overhead triceps stretch, elbow pointing up. 30 s each side.',
      'Straight-arm wall press, 12 slow reps.',
      'Shake the arms out for 20 s.',
    ],
  },
  forearms: {
    title: 'Forearm & Wrist Reset',
    durationSec: 120,
    steps: [
      'Palms together at chest, lower the hands to stretch the wrists. 30 s.',
      'Kneeling wrist stretch, fingers pointing back. 30 s.',
      'Open and close the fists, 20 reps.',
    ],
  },
  abs: {
    title: 'Trunk Decompression',
    durationSec: 120,
    steps: [
      'Cobra stretch, elbows down, 30 s.',
      'Standing side bends, 10 each side.',
      'Slow diaphragmatic breathing on your back, 60 s — the abs need it more than another crunch.',
    ],
  },
  obliques: {
    title: 'Oblique Unwind',
    durationSec: 120,
    steps: [
      'Standing side bend, 30 s each side.',
      'Supine spinal twist, knees dropped to one side. 40 s each side.',
      'Slow breathing into the ribcage, 40 s.',
    ],
  },
};

export function correctiveFor(region: RegionId): Corrective {
  return CORRECTIVES[region];
}
