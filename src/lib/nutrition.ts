import type { Fighter, NutritionLog } from './types';

/**
 * Daily macro targets derived from the biometrics captured at induction.
 *
 * These are training estimates, not clinical nutrition advice — see
 * `needsProfessionalNote` for the case where we say so louder.
 */
export interface MacroTarget {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  /** Basal metabolic rate, Mifflin-St Jeor. */
  bmr: number;
  /** BMR x activity factor, before any goal adjustment. */
  tdee: number;
  activityFactor: number;
  /** Negative = deficit. 0 = maintenance. */
  adjustmentPct: number;
  goalLabel: string;
  /** True when biometrics were missing and defaults were substituted. */
  estimated: boolean;
}

export interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

const DEFAULTS = { age: 30, height_cm: 170, weight_kg: 75 } as const;

/** Mifflin-St Jeor. The 'other' case averages the two sex constants. */
export function basalRate(input: {
  age: number;
  height_cm: number;
  weight_kg: number;
  sex?: 'male' | 'female' | 'other';
}): number {
  const base = 10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age;
  if (input.sex === 'male') return Math.round(base + 5);
  if (input.sex === 'female') return Math.round(base - 161);
  return Math.round(base - 78); // midpoint of +5 and -161
}

/** Activity multiplier from how many sessions actually got logged this week. */
export function activityFactorFor(sessionsPerWeek: number): number {
  if (sessionsPerWeek >= 6) return 1.75;
  if (sessionsPerWeek >= 4) return 1.6;
  if (sessionsPerWeek >= 2) return 1.45;
  return 1.3;
}

/** Goal → calorie adjustment. Ordered by priority: a cut beats everything else. */
function goalAdjustment(goals: string[]): { pct: number; label: string } {
  const has = (needle: string) =>
    goals.some((g) => g.toLowerCase().includes(needle));

  if (has('weight cut')) return { pct: -0.2, label: 'Weight cut' };
  if (has('fight prep')) return { pct: -0.1, label: 'Fight prep' };
  if (has('rehab')) return { pct: 0, label: 'Injury rehab' };
  if (has('conditioning')) return { pct: 0, label: 'Conditioning' };
  return { pct: 0, label: 'Maintenance' };
}

export function computeTargets(fighter: Fighter, sessionsPerWeek: number): MacroTarget {
  const bio = fighter.biological_data ?? {};
  const estimated =
    bio.age == null || bio.height_cm == null || bio.weight_kg == null;

  const age = bio.age ?? DEFAULTS.age;
  const height_cm = bio.height_cm ?? DEFAULTS.height_cm;
  const weight_kg = bio.weight_kg ?? DEFAULTS.weight_kg;

  const bmr = basalRate({ age, height_cm, weight_kg, sex: bio.sex });
  const activityFactor = activityFactorFor(sessionsPerWeek);
  const tdee = Math.round(bmr * activityFactor);

  const { pct, label } = goalAdjustment(fighter.goals ?? []);

  // Never prescribe below 1.1x BMR — an aggressive multiplier on a light
  // fighter can otherwise produce a genuinely unsafe number.
  const floor = Math.round(bmr * 1.1);
  const calories = Math.max(floor, Math.round(tdee * (1 + pct)));

  // Fighters on a deficit hold protein high to protect lean mass.
  const proteinPerKg = pct < 0 ? 2.0 : 1.8;
  const protein_g = Math.round(weight_kg * proteinPerKg);

  const fats_g = Math.round((calories * 0.25) / 9);
  const carbs_g = Math.max(
    0,
    Math.round((calories - protein_g * 4 - fats_g * 9) / 4),
  );

  return {
    calories,
    protein_g,
    carbs_g,
    fats_g,
    bmr,
    tdee,
    activityFactor,
    adjustmentPct: pct,
    goalLabel: label,
    estimated,
  };
}

/** Sums a day's logs. Nulls count as zero rather than poisoning the total. */
export function sumIntake(logs: NutritionLog[]): MacroTotals {
  return logs.reduce<MacroTotals>(
    (acc, l) => ({
      calories: acc.calories + (Number(l.calories) || 0),
      protein_g: acc.protein_g + (Number(l.protein_g) || 0),
      carbs_g: acc.carbs_g + (Number(l.carbs_g) || 0),
      fats_g: acc.fats_g + (Number(l.fats_g) || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 },
  );
}

export function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Anything cardiometabolic or medication-related means we should stop implying
 * these numbers are personalised advice.
 */
export function needsProfessionalNote(fighter: Fighter): boolean {
  const flagged = ['hypertension', 'diabetes', 'heart', 'kidney', 'thyroid', 'pregnan'];
  return (fighter.medical_conditions ?? []).some((c) =>
    flagged.some((f) => c.toLowerCase().includes(f)),
  );
}
