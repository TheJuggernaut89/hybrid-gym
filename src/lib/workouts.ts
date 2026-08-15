/**
 * WORKOUT LIBRARY
 *
 * The app was built around one modality — combat drills — while the gym it
 * serves has a weights floor, a cardio row, classes, and mats. A member who
 * came in for a leg day had nothing here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BIAS THIS FILE CARRIES ON PURPOSE
 *
 * The gym's goal is attendance: members using the facility and turning up to
 * classes. So every exercise declares `where` — and the planner leads with what
 * needs the gym. A plan that can be done entirely on a bedroom floor is a plan
 * that competes with the gym instead of filling it.
 *
 * That is a commercial bias, and it is stated rather than hidden. It only ever
 * reorders honest options; nothing here recommends a worse exercise because it
 * happens to need a rack.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type MuscleGroup =
  | 'legs'
  | 'glutes'
  | 'calves'
  | 'back'
  | 'traps'
  | 'chest'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'full_body'
  | 'conditioning'
  | 'combat';

/** Where it can be done. Drives the ordering — see the note above. */
export type Venue = 'gym' | 'class' | 'anywhere';

/** Movement pattern. Used to keep a session balanced rather than all-push. */
export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'push_h'
  | 'push_v'
  | 'pull_h'
  | 'pull_v'
  | 'carry'
  | 'rotate'
  | 'isolation'
  | 'cyclic'
  | 'skill';

export interface Exercise {
  id: string;
  name: string;
  group: MuscleGroup;
  /** Groups that also get worked. Drives the "you already hit this" logic. */
  also: MuscleGroup[];
  pattern: Pattern;
  venue: Venue;
  equipment: string;
  /** Compound movements go first in a session — heaviest when freshest. */
  compound: boolean;
  /** One line of how to do it. Not a coaching manual. */
  cue: string;
}

export interface FocusDay {
  id: string;
  label: string;
  /** What a member would actually call it. */
  blurb: string;
  groups: MuscleGroup[];
}

/**
 * The focus days a member picks from. Named the way people talk in a gym,
 * not the way an anatomy textbook does.
 */
export const FOCUS_DAYS: FocusDay[] = [
  { id: 'legs', label: 'Leg day', blurb: 'Quads, hamstrings, glutes', groups: ['legs', 'glutes'] },
  { id: 'back', label: 'Back day', blurb: 'Lats, mid-back, traps', groups: ['back', 'traps'] },
  { id: 'chest', label: 'Chest day', blurb: 'Press and fly patterns', groups: ['chest'] },
  { id: 'shoulders', label: 'Shoulder day', blurb: 'Delts, overhead work', groups: ['shoulders', 'traps'] },
  { id: 'arms', label: 'Arm day', blurb: 'Biceps, triceps, forearms', groups: ['arms'] },
  { id: 'core', label: 'Core day', blurb: 'Trunk, anti-rotation', groups: ['core'] },
  { id: 'glutes', label: 'Glute day', blurb: 'Hip extension and abduction', groups: ['glutes'] },
  { id: 'calves', label: 'Calf day', blurb: 'Gastroc and soleus', groups: ['calves'] },
  { id: 'push', label: 'Push day', blurb: 'Chest, shoulders, triceps', groups: ['chest', 'shoulders', 'arms'] },
  { id: 'pull', label: 'Pull day', blurb: 'Back, biceps, rear delts', groups: ['back', 'arms', 'traps'] },
  { id: 'full', label: 'Full body', blurb: 'One session, everything', groups: ['full_body', 'legs', 'back', 'chest'] },
  { id: 'conditioning', label: 'Conditioning', blurb: 'Engine work, intervals', groups: ['conditioning'] },
  { id: 'kickboxing', label: 'Kickboxing', blurb: 'Striking, pads, bagwork', groups: ['combat', 'conditioning'] },
  { id: 'grappling', label: 'Grappling', blurb: 'BJJ, wrestling, clinch', groups: ['combat', 'core'] },
];

export function focusById(id: string): FocusDay | null {
  return FOCUS_DAYS.find((f) => f.id === id) ?? null;
}

/* ── the library ─────────────────────────────────────────────────────────── */

export const EXERCISES: Exercise[] = [
  // ── legs ──
  { id: 'back-squat', name: 'Back Squat', group: 'legs', also: ['glutes', 'core'], pattern: 'squat', venue: 'gym', equipment: 'Barbell + rack', compound: true, cue: 'Brace, sit between the hips, knees track over toes.' },
  { id: 'front-squat', name: 'Front Squat', group: 'legs', also: ['core'], pattern: 'squat', venue: 'gym', equipment: 'Barbell + rack', compound: true, cue: 'Elbows high, stay tall, drive the floor away.' },
  { id: 'leg-press', name: 'Leg Press', group: 'legs', also: ['glutes'], pattern: 'squat', venue: 'gym', equipment: 'Leg press', compound: true, cue: 'Feet mid-platform, do not round the lower back at the bottom.' },
  { id: 'rdl', name: 'Romanian Deadlift', group: 'legs', also: ['glutes', 'back'], pattern: 'hinge', venue: 'gym', equipment: 'Barbell or dumbbells', compound: true, cue: 'Push hips back, bar close, stop when the hamstrings run out.' },
  { id: 'walking-lunge', name: 'Walking Lunge', group: 'legs', also: ['glutes'], pattern: 'lunge', venue: 'gym', equipment: 'Dumbbells', compound: true, cue: 'Long step, back knee down, torso upright.' },
  { id: 'bulgarian', name: 'Bulgarian Split Squat', group: 'legs', also: ['glutes'], pattern: 'lunge', venue: 'gym', equipment: 'Bench + dumbbells', compound: true, cue: 'Front foot far enough out that the knee stays behind the toes.' },
  { id: 'leg-ext', name: 'Leg Extension', group: 'legs', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Machine', compound: false, cue: 'Pause at the top, lower slower than you lift.' },
  { id: 'leg-curl', name: 'Lying Leg Curl', group: 'legs', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Machine', compound: false, cue: 'Hips down, curl the heels toward the glutes.' },
  { id: 'goblet-squat', name: 'Goblet Squat', group: 'legs', also: ['core'], pattern: 'squat', venue: 'anywhere', equipment: 'One dumbbell or kettlebell', compound: true, cue: 'Weight at the chest, elbows inside the knees at the bottom.' },

  // ── glutes ──
  { id: 'hip-thrust', name: 'Hip Thrust', group: 'glutes', also: ['legs'], pattern: 'hinge', venue: 'gym', equipment: 'Bench + barbell', compound: true, cue: 'Chin tucked, ribs down, squeeze at the top — do not arch the back.' },
  { id: 'cable-kickback', name: 'Cable Kickback', group: 'glutes', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Cable', compound: false, cue: 'Hinge slightly, drive the heel back, no lower-back swing.' },
  { id: 'abduction', name: 'Hip Abduction', group: 'glutes', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Machine or band', compound: false, cue: 'Lean forward slightly to bias the upper glute.' },
  { id: 'glute-bridge', name: 'Glute Bridge', group: 'glutes', also: ['core'], pattern: 'hinge', venue: 'anywhere', equipment: 'Bodyweight', compound: false, cue: 'Heels close, push through the heel, pause at the top.' },

  // ── calves ──
  { id: 'standing-calf', name: 'Standing Calf Raise', group: 'calves', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Machine or step', compound: false, cue: 'Full stretch at the bottom, hard squeeze at the top. Legs straight = gastroc.' },
  { id: 'seated-calf', name: 'Seated Calf Raise', group: 'calves', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Machine', compound: false, cue: 'Knees bent shifts the work to the soleus. Slow, no bouncing.' },
  { id: 'calf-step', name: 'Single-Leg Calf Raise', group: 'calves', also: [], pattern: 'isolation', venue: 'anywhere', equipment: 'A step', compound: false, cue: 'One leg, full range, hold the top for a second.' },

  // ── back ──
  { id: 'deadlift', name: 'Deadlift', group: 'back', also: ['legs', 'glutes', 'traps'], pattern: 'hinge', venue: 'gym', equipment: 'Barbell', compound: true, cue: 'Bar over mid-foot, lats tight, push the floor away.' },
  { id: 'pullup', name: 'Pull-Up', group: 'back', also: ['arms'], pattern: 'pull_v', venue: 'gym', equipment: 'Bar', compound: true, cue: 'Chest to the bar, control the way down.' },
  { id: 'lat-pulldown', name: 'Lat Pulldown', group: 'back', also: ['arms'], pattern: 'pull_v', venue: 'gym', equipment: 'Cable', compound: true, cue: 'Pull the elbows to the ribs, not the hands to the chin.' },
  { id: 'barbell-row', name: 'Barbell Row', group: 'back', also: ['traps', 'arms'], pattern: 'pull_h', venue: 'gym', equipment: 'Barbell', compound: true, cue: 'Hinge to about 45°, row to the belly button.' },
  { id: 'seated-row', name: 'Seated Cable Row', group: 'back', also: ['traps'], pattern: 'pull_h', venue: 'gym', equipment: 'Cable', compound: true, cue: 'Chest up, pull with the back not the arms, squeeze the shoulder blades.' },
  { id: 'db-row', name: 'Single-Arm Dumbbell Row', group: 'back', also: ['arms'], pattern: 'pull_h', venue: 'gym', equipment: 'Dumbbell + bench', compound: true, cue: 'Flat back, row toward the hip, no twisting.' },
  { id: 'face-pull', name: 'Face Pull', group: 'back', also: ['shoulders'], pattern: 'pull_h', venue: 'gym', equipment: 'Cable + rope', compound: false, cue: 'Pull to the forehead, elbows high, external rotation at the end.' },

  // ── traps ──
  { id: 'shrug', name: 'Barbell Shrug', group: 'traps', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Barbell or dumbbells', compound: false, cue: 'Straight up, no rolling. Pause at the top.' },
  { id: 'farmer', name: "Farmer's Carry", group: 'traps', also: ['core', 'back'], pattern: 'carry', venue: 'gym', equipment: 'Heavy dumbbells', compound: true, cue: 'Tall, ribs down, walk. Grip gives out before the traps do.' },
  { id: 'upright-row', name: 'Cable Upright Row', group: 'traps', also: ['shoulders'], pattern: 'pull_v', venue: 'gym', equipment: 'Cable', compound: false, cue: 'Stop at chest height. Higher than that annoys the shoulder.' },

  // ── chest ──
  { id: 'bench', name: 'Barbell Bench Press', group: 'chest', also: ['arms', 'shoulders'], pattern: 'push_h', venue: 'gym', equipment: 'Barbell + bench', compound: true, cue: 'Shoulder blades pinned, bar to the lower chest, drive with the legs.' },
  { id: 'incline-db', name: 'Incline Dumbbell Press', group: 'chest', also: ['shoulders'], pattern: 'push_h', venue: 'gym', equipment: 'Dumbbells + bench', compound: true, cue: 'About 30°. Higher and it becomes a shoulder press.' },
  { id: 'dip', name: 'Chest Dip', group: 'chest', also: ['arms'], pattern: 'push_h', venue: 'gym', equipment: 'Dip bars', compound: true, cue: 'Lean forward to bias the chest, stop when the shoulders feel it.' },
  { id: 'cable-fly', name: 'Cable Fly', group: 'chest', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Cable', compound: false, cue: 'Slight elbow bend held constant. Hug, do not press.' },
  { id: 'pushup', name: 'Push-Up', group: 'chest', also: ['arms', 'core'], pattern: 'push_h', venue: 'anywhere', equipment: 'Bodyweight', compound: true, cue: 'Body in one line, elbows about 45° from the ribs.' },

  // ── shoulders ──
  { id: 'ohp', name: 'Overhead Press', group: 'shoulders', also: ['arms', 'core'], pattern: 'push_v', venue: 'gym', equipment: 'Barbell', compound: true, cue: 'Squeeze the glutes, press, finish with the bar over the mid-foot.' },
  { id: 'db-shoulder', name: 'Dumbbell Shoulder Press', group: 'shoulders', also: ['arms'], pattern: 'push_v', venue: 'gym', equipment: 'Dumbbells', compound: true, cue: 'Do not flare the elbows straight out to the sides.' },
  { id: 'lat-raise', name: 'Lateral Raise', group: 'shoulders', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Dumbbells or cable', compound: false, cue: 'Lead with the elbow, stop at shoulder height, lower slowly.' },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly', group: 'shoulders', also: ['back'], pattern: 'isolation', venue: 'gym', equipment: 'Dumbbells or pec deck', compound: false, cue: 'Hinge over, wide arc, think about the back of the shoulder.' },

  // ── arms ──
  { id: 'barbell-curl', name: 'Barbell Curl', group: 'arms', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Barbell or EZ bar', compound: false, cue: 'Elbows pinned to the ribs. No swinging.' },
  { id: 'hammer-curl', name: 'Hammer Curl', group: 'arms', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Dumbbells', compound: false, cue: 'Neutral grip. Hits the brachialis and the forearm.' },
  { id: 'tricep-push', name: 'Tricep Pushdown', group: 'arms', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Cable', compound: false, cue: 'Elbows locked at the sides, full lockout at the bottom.' },
  { id: 'skullcrusher', name: 'Skullcrusher', group: 'arms', also: [], pattern: 'isolation', venue: 'gym', equipment: 'EZ bar + bench', compound: false, cue: 'Lower behind the head, not to the forehead. Kinder on the elbow.' },
  { id: 'wrist-curl', name: 'Wrist Curl', group: 'arms', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Dumbbells', compound: false, cue: 'Forearms on a bench, small range, high reps.' },

  // ── core ──
  { id: 'plank', name: 'Plank', group: 'core', also: [], pattern: 'isolation', venue: 'anywhere', equipment: 'Bodyweight', compound: false, cue: 'Ribs down, glutes on. Quality beats duration.' },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', group: 'core', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Bar', compound: false, cue: 'Curl the pelvis up. Swinging the legs is not the exercise.' },
  { id: 'pallof', name: 'Pallof Press', group: 'core', also: [], pattern: 'rotate', venue: 'gym', equipment: 'Cable or band', compound: false, cue: 'Resist the rotation. That is the whole point of it.' },
  { id: 'cable-crunch', name: 'Cable Crunch', group: 'core', also: [], pattern: 'isolation', venue: 'gym', equipment: 'Cable + rope', compound: false, cue: 'Round the spine deliberately, hips stay still.' },
  { id: 'deadbug', name: 'Dead Bug', group: 'core', also: [], pattern: 'isolation', venue: 'anywhere', equipment: 'Bodyweight', compound: false, cue: 'Lower back stays flat on the floor the whole time.' },

  // ── conditioning ──
  { id: 'assault-bike', name: 'Assault Bike Intervals', group: 'conditioning', also: ['legs'], pattern: 'cyclic', venue: 'gym', equipment: 'Assault bike', compound: true, cue: '30 seconds hard, 90 easy. Arms and legs together.' },
  { id: 'rower', name: 'Rowing Intervals', group: 'conditioning', also: ['back', 'legs'], pattern: 'cyclic', venue: 'gym', equipment: 'Rower', compound: true, cue: 'Legs, back, arms out — arms, back, legs in.' },
  { id: 'ski-erg', name: 'Ski Erg', group: 'conditioning', also: ['back', 'core'], pattern: 'cyclic', venue: 'gym', equipment: 'Ski erg', compound: true, cue: 'Drive from the hips, not just the arms.' },
  { id: 'treadmill-int', name: 'Treadmill Intervals', group: 'conditioning', also: ['legs'], pattern: 'cyclic', venue: 'gym', equipment: 'Treadmill', compound: true, cue: 'Run the work interval, step off or walk the rest.' },
  { id: 'skipping', name: 'Skipping', group: 'conditioning', also: ['calves'], pattern: 'cyclic', venue: 'anywhere', equipment: 'Rope', compound: true, cue: 'Small bounces off the forefoot, wrists do the turning.' },

  // ── combat ──
  { id: 'bagwork', name: 'Heavy Bag Rounds', group: 'combat', also: ['conditioning', 'core'], pattern: 'skill', venue: 'gym', equipment: 'Heavy bag + wraps', compound: true, cue: 'Three-minute rounds. Return the hand to the guard every time.' },
  { id: 'padwork', name: 'Pad Rounds', group: 'combat', also: ['conditioning'], pattern: 'skill', venue: 'class', equipment: 'A coach', compound: true, cue: 'Needs a partner or coach — this is what class is for.' },
  { id: 'shadow', name: 'Shadow Boxing', group: 'combat', also: ['conditioning'], pattern: 'skill', venue: 'anywhere', equipment: 'None', compound: true, cue: 'Move your feet. Punching air standing still teaches you nothing.' },
  { id: 'clinch', name: 'Clinch Drilling', group: 'combat', also: ['traps', 'core'], pattern: 'skill', venue: 'class', equipment: 'A partner', compound: true, cue: 'Needs a partner — book the class.' },
  { id: 'drilling', name: 'Technique Drilling', group: 'combat', also: [], pattern: 'skill', venue: 'class', equipment: 'A partner', compound: true, cue: 'Reps under a coach who can see what you cannot.' },

  // ── full body ──
  { id: 'clean', name: 'Power Clean', group: 'full_body', also: ['legs', 'traps', 'back'], pattern: 'hinge', venue: 'gym', equipment: 'Barbell', compound: true, cue: 'Speed, not grind. Stop the set when the bar slows.' },
  { id: 'kb-swing', name: 'Kettlebell Swing', group: 'full_body', also: ['glutes', 'core'], pattern: 'hinge', venue: 'gym', equipment: 'Kettlebell', compound: true, cue: 'Hips snap, arms are rope. Not a front raise.' },
  { id: 'thruster', name: 'Thruster', group: 'full_body', also: ['legs', 'shoulders'], pattern: 'squat', venue: 'gym', equipment: 'Barbell or dumbbells', compound: true, cue: 'Squat, then use the drive to press. One movement.' },
  { id: 'burpee', name: 'Burpee', group: 'full_body', also: ['conditioning'], pattern: 'squat', venue: 'anywhere', equipment: 'Bodyweight', compound: true, cue: 'Chest to floor, jump at the top. Pace it.' },
];

export function exercisesFor(groups: MuscleGroup[]): Exercise[] {
  const want = new Set(groups);
  return EXERCISES.filter((e) => want.has(e.group) || e.also.some((g) => want.has(g)));
}

/* ── prep ────────────────────────────────────────────────────────────────── */

export interface PrepStep {
  name: string;
  detail: string;
  /** Reps, or seconds for holds. */
  dose: string;
}

/**
 * What has to happen before the working sets.
 *
 * Deliberately specific to the muscle group rather than a generic "5 min
 * cardio". A leg day and a shoulder day need different tissue ready, and a
 * warm-up nobody believes in is a warm-up nobody does.
 */
export const PREP: Record<MuscleGroup, PrepStep[]> = {
  legs: [
    { name: 'Raise the temperature', detail: 'Bike or brisk incline walk', dose: '5 min' },
    { name: 'Ankle rocks', detail: 'Knee over toe against a wall — this is what limits squat depth', dose: '10 each side' },
    { name: '90/90 hip switches', detail: 'Seated, rotate both knees floor to floor', dose: '10 each side' },
    { name: 'Bodyweight squats', detail: 'Slow, full depth, pause at the bottom', dose: '15' },
    { name: 'Empty bar / light set', detail: 'First working movement, half the weight', dose: '2 sets of 8' },
  ],
  glutes: [
    { name: 'Raise the temperature', detail: 'Bike or brisk walk', dose: '5 min' },
    { name: 'Banded lateral walks', detail: 'Band above the knees, stay low', dose: '15 each way' },
    { name: 'Glute bridges', detail: 'Pause and squeeze at the top', dose: '15' },
    { name: 'Bird dog', detail: 'Opposite arm and leg, no hip rotation', dose: '8 each side' },
  ],
  calves: [
    { name: 'Raise the temperature', detail: 'Easy skipping or walking', dose: '4 min' },
    { name: 'Ankle circles', detail: 'Both directions', dose: '10 each way' },
    { name: 'Bodyweight calf raises', detail: 'Full range, slow', dose: '20' },
  ],
  back: [
    { name: 'Raise the temperature', detail: 'Rower, easy pace', dose: '5 min' },
    { name: 'Scapular pull-ups', detail: 'Hang, pull the shoulders down without bending the arms', dose: '10' },
    { name: 'Band pull-aparts', detail: 'Straight arms, squeeze the shoulder blades', dose: '20' },
    { name: 'Cat-cow', detail: 'Move the whole spine segment by segment', dose: '10' },
    { name: 'Light first set', detail: 'Your first back movement, easy weight', dose: '2 sets of 10' },
  ],
  traps: [
    { name: 'Raise the temperature', detail: 'Rower or ski erg', dose: '4 min' },
    { name: 'Neck circles', detail: 'Slow, both directions, no forcing', dose: '5 each way' },
    { name: 'Band pull-aparts', detail: 'High elbows', dose: '20' },
    { name: 'Light shrugs', detail: 'Half the working weight', dose: '15' },
  ],
  chest: [
    { name: 'Raise the temperature', detail: 'Bike or rower', dose: '5 min' },
    { name: 'Band pull-aparts', detail: 'Balances all the pressing to come', dose: '20' },
    { name: 'Shoulder dislocates', detail: 'Band or broomstick, wide grip, slow', dose: '10' },
    { name: 'Push-ups', detail: 'Controlled, full range', dose: '10' },
    { name: 'Empty bar press', detail: 'Groove the path before loading', dose: '2 sets of 10' },
  ],
  shoulders: [
    { name: 'Raise the temperature', detail: 'Bike or ski erg', dose: '5 min' },
    { name: 'Shoulder dislocates', detail: 'Band, as wide as needed to stay smooth', dose: '10' },
    { name: 'External rotations', detail: 'Light band, elbow at the side', dose: '15 each arm' },
    { name: 'Wall slides', detail: 'Forearms on the wall, slide up without arching', dose: '10' },
    { name: 'Empty bar overhead', detail: 'Find the groove', dose: '2 sets of 10' },
  ],
  arms: [
    { name: 'Raise the temperature', detail: 'Any easy cardio', dose: '4 min' },
    { name: 'Elbow circles', detail: 'Both directions', dose: '10 each way' },
    { name: 'Light curls and pushdowns', detail: 'Very light, just get blood in', dose: '15 each' },
  ],
  core: [
    { name: 'Raise the temperature', detail: 'Easy cardio', dose: '4 min' },
    { name: 'Cat-cow', detail: 'Wake the spine up', dose: '10' },
    { name: 'Dead bug', detail: 'Lower back flat throughout', dose: '8 each side' },
    { name: 'Bird dog', detail: 'Slow, no wobbling', dose: '8 each side' },
  ],
  full_body: [
    { name: 'Raise the temperature', detail: 'Bike, rower or skipping', dose: '6 min' },
    { name: 'World\'s greatest stretch', detail: 'Lunge, rotate, reach', dose: '5 each side' },
    { name: 'Bodyweight squats', detail: 'Full depth', dose: '15' },
    { name: 'Band pull-aparts', detail: 'Get the upper back ready', dose: '20' },
    { name: 'Light complex', detail: 'Empty bar through the day\'s movements', dose: '2 rounds' },
  ],
  conditioning: [
    { name: 'Easy pace', detail: 'Whatever machine you are using, half effort', dose: '5 min' },
    { name: 'Leg swings', detail: 'Front to back, then across', dose: '10 each way' },
    { name: 'Build-ups', detail: 'Three 20-second efforts, rising to working pace', dose: '3' },
  ],
  combat: [
    { name: 'Skipping', detail: 'Easy, get the ankles and calves warm', dose: '5 min' },
    { name: 'Neck and shoulder circles', detail: 'Slow and controlled', dose: '10 each' },
    { name: 'Hip openers', detail: 'Knee circles standing, both directions', dose: '10 each side' },
    { name: 'Shadow boxing', detail: 'Light, technical, move the feet', dose: '2 rounds' },
  ],
};

export function prepFor(focus: FocusDay): PrepStep[] {
  const seen = new Set<string>();
  const out: PrepStep[] = [];
  for (const g of focus.groups) {
    for (const step of PREP[g] ?? []) {
      if (seen.has(step.name)) continue;
      seen.add(step.name);
      out.push(step);
    }
  }
  return out;
}

/** Rough minutes for the prep block, so the planner can state a real number. */
export function prepMinutes(steps: PrepStep[]): number {
  return steps.reduce((sum, s) => {
    const m = s.dose.match(/(\d+)\s*min/);
    return sum + (m ? Number(m[1]) : 1);
  }, 0);
}

/* ── the session ─────────────────────────────────────────────────────────── */

export interface PlannedSet {
  exercise: Exercise;
  sets: number;
  reps: string;
  note?: string;
}

export interface DayPlan {
  focus: FocusDay;
  prep: PrepStep[];
  prepMin: number;
  main: PlannedSet[];
  /** Needs the gym floor. Surfaced so the member knows why they are coming in. */
  gymOnly: number;
  /** Needs a coach or a partner — i.e. book a class. */
  needsClass: PlannedSet[];
}

/**
 * Builds the day.
 *
 * Compounds first (heaviest when freshest), then isolation. Gym-venue work is
 * preferred at equal quality — see the note at the top of this file.
 */
export function buildDay(focus: FocusDay, opts: { slots?: number } = {}): DayPlan {
  const slots = opts.slots ?? 5;
  const pool = exercisesFor(focus.groups);

  const want = new Set(focus.groups);

  const rank = (e: Exercise) =>
    // Primary-group matches first. Without this a leg day fills up with ergs,
    // because the bike and the rower both list legs as a secondary — true, but
    // not what anyone means by "leg day".
    (want.has(e.group) ? 0 : 100) +
    (e.compound ? 0 : 10) +
    (e.venue === 'gym' ? 0 : e.venue === 'class' ? 1 : 2);

  const chosen: Exercise[] = [];
  const usedPatterns = new Set<Pattern>();

  for (const e of [...pool].sort((a, b) => rank(a) - rank(b))) {
    if (chosen.length >= slots) break;
    // One movement per pattern until the slots force a repeat — stops a leg day
    // coming out as four different squats.
    if (usedPatterns.has(e.pattern) && chosen.length < slots - 1) continue;
    usedPatterns.add(e.pattern);
    chosen.push(e);
  }

  const main: PlannedSet[] = chosen.map((exercise) => ({
    exercise,
    sets: exercise.compound ? 4 : 3,
    reps: exercise.pattern === 'cyclic' || exercise.pattern === 'skill'
      ? '3 rounds'
      : exercise.compound
        ? '5–8'
        : '10–15',
    note: exercise.cue,
  }));

  const prep = prepFor(focus);

  return {
    focus,
    prep,
    prepMin: prepMinutes(prep),
    main,
    gymOnly: main.filter((m) => m.exercise.venue === 'gym').length,
    needsClass: main.filter((m) => m.exercise.venue === 'class'),
  };
}
