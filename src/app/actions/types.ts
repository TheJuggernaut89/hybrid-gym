export interface ActionResult {
  ok: boolean;
  message: string;
  /** XP awarded by this action, when applicable. */
  xp?: number;
  /** Fighter level after the action, when applicable. */
  level?: number;
  /** True when nothing was persisted because Supabase is not configured. */
  demo?: boolean;
}

export const DEMO_RESULT = (xp: number): ActionResult => ({
  ok: true,
  demo: true,
  xp,
  message: `DEMO MODE — ${xp} XP would be banked. Connect Supabase to persist.`,
});
