import type {
  Bounty,
  Fighter,
  HomeSession,
  NutritionLog,
  TrainingSession,
  WorkoutLog,
} from './types';
import type { GymSlot, SlotDeclaration } from './slots';
import type { TechniqueProgress } from './ladder';

const DEMO_ID = '00000000-0000-4000-8000-000000000001';

/** Deterministic stand-in fighter used whenever Supabase is not configured. */
export const DEMO_FIGHTER: Fighter = {
  id: DEMO_ID,
  name: 'HARSHANA',
  clan_tag: 'DAMANSARA',
  level: 12,
  total_xp: 13_240,
  craft_xp: 3_180,
  engine_xp: 4_920,
  strength_xp: 2_450,
  power_xp: 1_610,
  recovery_xp: 1_080,
  streak_count: 9,
  rest_shields: 2,
  last_active_date: null,
  biological_data: { age: 27, sex: 'male', height_cm: 174, weight_kg: 78 },
  medical_conditions: ['Mild hypertension'],
  goals: ['Weight cut', 'Striking technique'],
  onboarded: true,
};

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export const DEMO_WORKOUTS: WorkoutLog[] = [
  {
    id: 'w1', fighter_id: DEMO_ID, equipment_type: 'assault_bike',
    raw_ocr_data: { time_display: '12:00' }, calories: 214, active_minutes: 12,
    distance_m: 4_100, xp_awarded: 345,
    coach_comment: 'Bike said 214 cal. Legs said nothing — they were screaming.',
    created_at: iso(0),
  },
  {
    id: 'w2', fighter_id: DEMO_ID, equipment_type: 'rower',
    raw_ocr_data: { time_display: '20:00' }, calories: 268, active_minutes: 20,
    distance_m: 5_000, xp_awarded: 442,
    coach_comment: '5k on the rower before 7am. Confirmed: you have a problem.',
    created_at: iso(1),
  },
  {
    id: 'w3', fighter_id: DEMO_ID, equipment_type: 'assault_bike',
    raw_ocr_data: { time_display: '08:30' }, calories: 155, active_minutes: 8.5,
    distance_m: 2_900, xp_awarded: 250,
    coach_comment: 'Short one lah. Still counts.',
    created_at: iso(3),
  },
];

export const DEMO_HOME_SESSIONS: HomeSession[] = [
  {
    id: 'h1', fighter_id: DEMO_ID, drill_name: 'Jab–Cross Shadow',
    rep_count: 88, duration_seconds: 300, form_accuracy_score: 84,
    fatigue_zones: ['shoulders'], strain_flags: [],
    corrective_action: null, xp_awarded: 116, created_at: iso(0),
  },
  {
    id: 'h2', fighter_id: DEMO_ID, drill_name: 'Fighter Squat',
    rep_count: 42, duration_seconds: 240, form_accuracy_score: 71,
    fatigue_zones: ['quads'], strain_flags: ['lower_back'],
    corrective_action: 'Cat-Cow + Hip Flexor Opener — 2 min',
    xp_awarded: 97, created_at: iso(2),
  },
];

/**
 * Classes and floor work. The demo fighter has to look like a real member of a
 * hybrid gym — mostly mat time and lifting, with the cardio console and the
 * home drills as the minority. A demo built only from workout_logs and
 * home_sessions quietly showed the app as it looked with this table missing.
 */
export const DEMO_TRAINING_SESSIONS: TrainingSession[] = [
  {
    id: 't1', fighter_id: DEMO_ID, session_type: 'combat', stat: 'craft',
    duration_min: 60, rpe: 8, load_au: 480, label: 'Muay Thai — Coach Faiz',
    created_at: iso(0),
  },
  {
    id: 't2', fighter_id: DEMO_ID, session_type: 'lift', stat: 'strength',
    duration_min: 55, rpe: 7, load_au: 385, label: 'Leg day',
    created_at: iso(1),
  },
  {
    id: 't3', fighter_id: DEMO_ID, session_type: 'class', stat: 'craft',
    duration_min: 75, rpe: 7, load_au: 525, label: 'BJJ — Coach Ray',
    created_at: iso(2),
  },
  {
    id: 't4', fighter_id: DEMO_ID, session_type: 'conditioning', stat: 'engine',
    duration_min: 30, rpe: 9, load_au: 270, label: 'Conditioning',
    created_at: iso(4),
  },
];

export const DEMO_NUTRITION: NutritionLog[] = [
  {
    id: 'n1', fighter_id: DEMO_ID, dish_name: 'Nasi Lemak (with fried chicken)',
    calories: 780, protein_g: 34, carbs_g: 88, fats_g: 33,
    portion_note: 'Full plate, extra sambal.',
    coach_comment: 'Nasi lemak on a cut? Bold. Walk it off — 40 minutes, no excuses.',
    created_at: iso(0),
  },
  {
    id: 'n2', fighter_id: DEMO_ID, dish_name: 'Chicken Rice (steamed)',
    calories: 545, protein_g: 42, carbs_g: 62, fats_g: 14,
    portion_note: 'Half chicken, no skin, extra cucumber.',
    coach_comment: 'Steamed not roasted. Look at you making decisions.',
    created_at: iso(0),
  },
  {
    id: 'n3', fighter_id: DEMO_ID, dish_name: 'Protein shake + banana',
    calories: 290, protein_g: 28, carbs_g: 34, fats_g: 4,
    portion_note: 'One scoop, water, medium banana.',
    coach_comment: 'Post-session. Fine. Not a meal though — do not pretend it is.',
    created_at: iso(0),
  },
];

/** One technique at each rung, so every cue policy is visible in demo. */
export const DEMO_TECHNIQUE_PROGRESS: Record<string, TechniqueProgress> = {
  'jab-cross': { drillId: 'jab-cross', stage: 'SUMMARY', cleanRun: 1, probesPassed: 0, probesFailed: 1, bestScore: 88, lastScore: 84, sessions: 14 },
  'fighter-squat': { drillId: 'fighter-squat', stage: 'BANDWIDTH', cleanRun: 1, probesPassed: 0, probesFailed: 0, bestScore: 81, lastScore: 71, sessions: 9 },
  'high-knees': { drillId: 'high-knees', stage: 'MASTERED', cleanRun: 0, probesPassed: 1, probesFailed: 0, bestScore: 93, lastScore: 90, sessions: 21 },
  'push-up': { drillId: 'push-up', stage: 'SILENT_PROBE', cleanRun: 0, probesPassed: 0, probesFailed: 0, bestScore: 86, lastScore: 85, sessions: 11 },
  'plank-hold': { drillId: 'plank-hold', stage: 'ACQUIRE', cleanRun: 0, probesPassed: 0, probesFailed: 0, bestScore: 64, lastScore: 61, sessions: 3 },
};

export const DEMO_GYM_SLOTS: GymSlot[] = [
  { id: 'g1', code: 'MON-MT-1930', dayOfWeek: 1, startTime: '19:30', durationMin: 60, className: 'Muay Thai', coachName: 'Coach Faiz' },
  { id: 'g2', code: 'TUE-BOX-0700', dayOfWeek: 2, startTime: '07:00', durationMin: 60, className: 'Boxing', coachName: 'Coach Ridzuan' },
  { id: 'g3', code: 'TUE-COND-1930', dayOfWeek: 2, startTime: '19:30', durationMin: 45, className: 'Conditioning', coachName: 'Coach Ash' },
  { id: 'g4', code: 'WED-MT-1930', dayOfWeek: 3, startTime: '19:30', durationMin: 60, className: 'Muay Thai', coachName: 'Coach Faiz' },
  { id: 'g5', code: 'THU-BJJ-2000', dayOfWeek: 4, startTime: '20:00', durationMin: 75, className: 'BJJ Fundamentals', coachName: 'Coach Wei' },
  { id: 'g6', code: 'FRI-BOX-1930', dayOfWeek: 5, startTime: '19:30', durationMin: 60, className: 'Boxing', coachName: 'Coach Ridzuan' },
  { id: 'g7', code: 'SAT-SPAR-1000', dayOfWeek: 6, startTime: '10:00', durationMin: 90, className: 'Open Sparring', coachName: 'Coach Faiz' },
  { id: 'g8', code: 'SUN-COND-0900', dayOfWeek: 0, startTime: '09:00', durationMin: 45, className: 'Conditioning', coachName: 'Coach Ash' },
];

/**
 * Two declarations so both halves of THE SLOT are visible in demo:
 * one live at T-70 (the nudge + graded downgrade), and one from yesterday that
 * was never resolved (the decline-reason capture).
 */
export const DEMO_DECLARATIONS: SlotDeclaration[] = [
  {
    id: 'd1',
    gymSlotId: 'g1',
    kind: 'class',
    className: 'Muay Thai',
    coachName: 'Coach Faiz',
    scheduledFor: new Date(Date.now() + 70 * 60_000).toISOString(),
    durationMin: 60,
    status: 'declared',
    downgradeTo: null,
    declineReason: null,
  },
  {
    id: 'd0',
    gymSlotId: 'g5',
    kind: 'class',
    className: 'BJJ Fundamentals',
    coachName: 'Coach Wei',
    scheduledFor: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    durationMin: 75,
    status: 'declared',
    downgradeTo: null,
    declineReason: null,
  },
];

export const DEMO_BOUNTIES: Bounty[] = [
  { id: 'b1', code: 'WEEKLY_BURN', title: 'FURNACE PROTOCOL', description: 'Burn 2500 calories on gym equipment this week.', target_metric: 'calories', target_value: 2500, xp_reward: 600 },
  { id: 'b2', code: 'WEEKLY_MINUTES', title: 'TIME UNDER FIRE', description: 'Log 150 active minutes across any machine.', target_metric: 'active_minutes', target_value: 150, xp_reward: 450 },
  { id: 'b3', code: 'WEEKLY_SHADOW', title: 'SHADOW DISCIPLINE', description: 'Finish 5 form drills at home.', target_metric: 'home_sessions', target_value: 5, xp_reward: 350 },
  // A load bounty, reachable from any modality — the mats, the floor or a
  // machine. Replaces STREAK_SEVEN, which was the largest reward in this set
  // and paid 700 XP for seven consecutive training days: precisely the pattern
  // computeLoad flags as monotonous and vetoes every upsell for.
  { id: 'b4', code: 'WEEKLY_LOAD', title: 'TOTAL TONNAGE', description: 'Bank 2000 AU of session load this week — mats, floor or machines.', target_metric: 'load', target_value: 2000, xp_reward: 700 },
];
