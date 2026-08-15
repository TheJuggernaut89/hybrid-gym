import type { Bounty, BountyProgress, Fighter, HomeSession, WorkoutLog } from './types';
import { startOfWeekUtc } from './utils';
import { xpFromHome, xpFromOcr } from './xp';

export function computeBountyProgress(
  bounties: Bounty[],
  fighter: Fighter,
  workouts: WorkoutLog[],
  homeSessions: HomeSession[],
  /** Universal sessions — the weights floor, classes, mats. */
  trainingSessions: Array<{ created_at: string; load_au: number }> = [],
): BountyProgress[] {
  const weekStart = startOfWeekUtc().getTime();
  const thisWeek = <T extends { created_at: string }>(rows: T[]) =>
    rows.filter((r) => new Date(r.created_at).getTime() >= weekStart);

  const w = thisWeek(workouts);
  const h = thisWeek(homeSessions);
  const t = thisWeek(trainingSessions);

  const totals = {
    // Load counts work from EVERY modality, which is the point: a calorie
    // bounty can only be cleared on cardio equipment, so it quietly tells the
    // weights floor and every class member that the bounty is not for them.
    load:
      t.reduce((sum, r) => sum + (Number(r.load_au) || 0), 0) +
      w.reduce((sum, r) => sum + xpFromOcr({ activeMinutes: r.active_minutes }), 0) +
      h.reduce(
        (sum, r) =>
          sum +
          xpFromHome({
            accuracy: Number(r.form_accuracy_score ?? 0),
            durationSeconds: Number(r.duration_seconds ?? 0),
          }),
        0,
      ),
    calories: w.reduce((sum, r) => sum + (r.calories ?? 0), 0),
    active_minutes: w.reduce((sum, r) => sum + (r.active_minutes ?? 0), 0),
    sessions: w.length + t.length,
    home_sessions: h.length,
    accuracy_avg: h.length
      ? h.reduce((sum, r) => sum + Number(r.form_accuracy_score ?? 0), 0) / h.length
      : 0,
    streak: fighter.streak_count,
  };

  return bounties.map((b) => {
    const current = totals[b.target_metric] ?? 0;
    const pct = Math.min(100, Math.round((current / b.target_value) * 100));
    return { ...b, current: Math.round(current), pct, complete: pct >= 100 };
  });
}
