'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { xpFromHome } from '@/lib/xp';
import {
  applySession,
  newProgress,
  type LadderEvent,
  type LadderStage,
  type TechniqueProgress,
} from '@/lib/ladder';
import type { StatKey } from '@/lib/types';
import { type ActionResult } from './types';

export interface HomeSessionPayload {
  drillId: string;
  drillName: string;
  stat: StatKey;
  repCount: number;
  durationSeconds: number;
  accuracy: number;
  fatigueZones: string[];
  strainFlags: string[];
  correctiveAction: string | null;
  /** The stage the session was actually performed under. */
  ladderStage: LadderStage;
}

export interface HomeSessionResult extends ActionResult {
  ladder?: {
    from: LadderStage;
    to: LadderStage;
    event: LadderEvent;
    message: string;
    cleanRun: number;
  };
}

export async function saveHomeSession(
  payload: HomeSessionPayload,
): Promise<HomeSessionResult> {
  const xp = xpFromHome({
    accuracy: payload.accuracy,
    durationSeconds: payload.durationSeconds,
  });

  // Demo mode still runs the ladder so the transition is visible — it just
  // starts from a fresh record each time instead of a stored one.
  if (!isSupabaseConfigured) {
    const seed: TechniqueProgress = {
      ...newProgress(payload.drillId),
      stage: payload.ladderStage,
      cleanRun: payload.ladderStage === 'ACQUIRE' ? 1 : 1,
    };
    const result = applySession(seed, payload.accuracy);
    return {
      ok: true,
      demo: true,
      xp,
      message: `DEMO MODE — ${xp} XP would be banked. Connect Supabase to persist.`,
      ladder: {
        from: payload.ladderStage,
        to: result.progress.stage,
        event: result.event,
        message: result.message,
        cleanRun: result.progress.cleanRun,
      },
    };
  }

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { error: insertError } = await supabase.from('home_sessions').insert({
    fighter_id: user.id,
    drill_name: payload.drillName,
    rep_count: payload.repCount,
    duration_seconds: payload.durationSeconds,
    form_accuracy_score: payload.accuracy,
    fatigue_zones: payload.fatigueZones,
    strain_flags: payload.strainFlags,
    corrective_action: payload.correctiveAction,
    ladder_stage: payload.ladderStage,
    xp_awarded: xp,
  });
  if (insertError) return { ok: false, message: `Log failed: ${insertError.message}` };

  // ── advance the ladder ───────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('technique_progress')
    .select('*')
    .eq('fighter_id', user.id)
    .eq('drill_id', payload.drillId)
    .maybeSingle();

  const prior: TechniqueProgress = existing
    ? {
        drillId: payload.drillId,
        stage: existing.stage as LadderStage,
        cleanRun: existing.clean_run,
        probesPassed: existing.probes_passed,
        probesFailed: existing.probes_failed,
        bestScore: Number(existing.best_score),
        lastScore: existing.last_score === null ? null : Number(existing.last_score),
        sessions: existing.sessions,
      }
    : newProgress(payload.drillId);

  const ladder = applySession(prior, payload.accuracy);
  const p = ladder.progress;

  const { error: ladderError } = await supabase.from('technique_progress').upsert(
    {
      fighter_id: user.id,
      drill_id: payload.drillId,
      stage: p.stage,
      clean_run: p.cleanRun,
      probes_passed: p.probesPassed,
      probes_failed: p.probesFailed,
      best_score: p.bestScore,
      last_score: p.lastScore,
      sessions: p.sessions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fighter_id,drill_id' },
  );
  if (ladderError) {
    // The session is already saved; a ladder write failure must not lose it.
    return {
      ok: true,
      xp,
      message: `Drill logged (+${xp} XP), but the ladder did not update: ${ladderError.message}`,
    };
  }

  // A session flagged for strain feeds recovery instead of the drill's own stat —
  // the fighter earned rehab, not more volume.
  const stat: StatKey = payload.strainFlags.length > 0 ? 'recovery' : payload.stat;

  const { data: fighter, error: xpError } = await supabase.rpc('award_xp', {
    p_fighter_id: user.id,
    p_stat: stat,
    p_amount: xp,
    p_rest_day: false,
  });
  if (xpError) return { ok: false, message: `XP award failed: ${xpError.message}` };

  revalidatePath('/hud');
  revalidatePath('/now');
  return {
    ok: true,
    xp,
    level: (fighter as { level?: number } | null)?.level,
    message: `Drill logged. +${xp} XP.`,
    ladder: {
      from: prior.stage,
      to: p.stage,
      event: ladder.event,
      message: ladder.message,
      cleanRun: p.cleanRun,
    },
  };
}
