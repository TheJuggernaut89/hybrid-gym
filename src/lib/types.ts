/**
 * Trainable qualities, not modalities.
 *
 * The original axes (striking / stamina / agility) were combat-specific, which
 * silently told a member doing spin or a push-pull-legs split that the app was
 * not for them. These generalise while staying in the gym's voice:
 *
 *   craft    <- striking   technique and movement quality, in ANY discipline:
 *                          a cleaner squat counts the same as a cleaner jab
 *   engine   <- stamina    aerobic and anaerobic conditioning
 *   power    <- agility    rate of force development: plyo, oly, sprints
 *   strength               maximal force
 *   recovery               restorative work — mobility, rehab, deliberate rest
 */
export type StatKey = 'craft' | 'engine' | 'strength' | 'power' | 'recovery';

export interface BiologicalData {
  age?: number;
  sex?: 'male' | 'female' | 'other';
  height_cm?: number;
  weight_kg?: number;
}

export interface Fighter {
  id: string;
  name: string;
  clan_tag: string;
  level: number;
  total_xp: number;
  craft_xp: number;
  engine_xp: number;
  strength_xp: number;
  power_xp: number;
  recovery_xp: number;
  streak_count: number;
  rest_shields: number;
  last_active_date: string | null;
  biological_data: BiologicalData;
  medical_conditions: string[];
  goals: string[];
  onboarded: boolean;
}

export interface WorkoutLog {
  id: string;
  fighter_id: string;
  equipment_type: string;
  raw_ocr_data: Record<string, unknown>;
  calories: number | null;
  active_minutes: number | null;
  distance_m: number | null;
  xp_awarded: number;
  coach_comment: string | null;
  created_at: string;
}

export interface HomeSession {
  id: string;
  fighter_id: string;
  drill_name: string;
  rep_count: number;
  duration_seconds: number;
  form_accuracy_score: number;
  fatigue_zones: string[];
  strain_flags: string[];
  corrective_action: string | null;
  xp_awarded: number;
  created_at: string;
}

/**
 * The universal session record — a class, a lift, a round on the mats.
 *
 * This is the only table that covers the members who never take a class, which
 * is most of them. Anything that reads "did this person train" must read it.
 */
export interface TrainingSession {
  id: string;
  fighter_id: string;
  session_type: string;
  stat: StatKey;
  duration_min: number;
  rpe: number;
  /** Session-RPE: duration x rpe. The app's cross-modality currency. */
  load_au: number;
  label: string | null;
  created_at: string;
}

export interface NutritionLog {
  id: string;
  fighter_id: string;
  dish_name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  portion_note: string | null;
  coach_comment: string | null;
  created_at: string;
}

export type BountyMetric =
  /** Total session load (duration x RPE) across every modality. Prefer this. */
  | 'load'
  /**
   * Legacy, and biased: a calorie target is only reachable on cardio equipment,
   * so it silently excludes the weights floor and every class. Kept so existing
   * bounty rows keep working — do not author new ones against it.
   */
  | 'calories'
  | 'active_minutes'
  | 'sessions'
  | 'home_sessions'
  | 'accuracy_avg';
/*
 * 'streak' was removed. `award_xp` advanced streak_count only when the UTC
 * calendar date advanced, so an evening session followed by a 07:00 class the
 * next morning read as the same day and the counter never moved. STREAK_SEVEN
 * was the largest bounty in the seed set at 700 XP and was close to unwinnable
 * for anyone who trains mornings. Migration 012 deactivates the row.
 */

export interface Bounty {
  id: string;
  code: string;
  title: string;
  description: string;
  target_metric: BountyMetric;
  target_value: number;
  xp_reward: number;
}

export interface BountyProgress extends Bounty {
  current: number;
  pct: number;
  complete: boolean;
}

/** Shape every vision route returns, per the spec contract. */
export interface VisionEnvelope<T> {
  status: 'success' | 'error';
  type: 'equipment_ocr' | 'nutrition_vision';
  data: T;
  roast_or_hype: string;
  source?: 'live' | 'mock';
}

export interface EquipmentOcrData {
  equipment_type: 'assault_bike' | 'rower' | 'treadmill' | 'ski_erg' | 'other';
  time_display: string | null;
  active_minutes: number | null;
  distance_m: number | null;
  calories: number | null;
  confidence: 'high' | 'medium' | 'low';
  unreadable_fields: string[];
}

export interface NutritionVisionData {
  dish_name: string;
  portion_note: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  confidence: 'high' | 'medium' | 'low';
  items: string[];
  /** Where the portion number came from — a flat photo, or something stated aloud. */
  portion_basis?: string;
  /** The eater's own stated confidence, when a voice note supplied one. */
  stated_confidence?: 'sure' | 'unsure' | null;
}
