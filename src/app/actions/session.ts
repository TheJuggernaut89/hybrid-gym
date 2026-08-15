'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { clampRpe, sessionLoad, sessionTypeFor } from '@/lib/session';
import type { ActionResult } from './types';

export interface LogSessionPayload {
  /** One of SESSION_TYPES. */
  sessionType: string;
  durationMin: number;
  rpe: number;
  label?: string;
  /** Set when this session came from honouring a declared slot. */
  declarationId?: string | null;
}

/**
 * The universal session log.
 *
 * Every modality on the gym floor comes through here — weights, classes,
 * mats, mobility — which is the point. Before this existed the app could only
 * see a cardio console it could OCR and a solo drill done at home, so most
 * members trained invisibly, earned nothing, and (because nutrition targets
 * read the session count) were told to eat as if sedentary.
 */
export async function logSession(payload: LogSessionPayload): Promise<ActionResult> {
  const type = sessionTypeFor(payload.sessionType);
  if (!type) return { ok: false, message: 'Unknown session type.' };

  const duration = Math.round(Number(payload.durationMin) || 0);
  if (duration <= 0 || duration > 300) {
    return { ok: false, message: 'Duration must be between 1 and 300 minutes.' };
  }
  const rpe = clampRpe(Number(payload.rpe));
  const load = sessionLoad(duration, rpe);

  if (!isSupabaseConfigured) {
    return {
      ok: true,
      demo: true,
      message: `DEMO MODE — ${type.label} logged, ${load} AU. Connect Supabase to persist.`,
    };
  }

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { error } = await supabase.rpc('log_session', {
    p_fighter_id: user.id,
    p_session_type: type.id,
    p_stat: type.stat,
    p_duration_min: duration,
    p_rpe: rpe,
    p_label: payload.label ?? null,
    p_declaration_id: payload.declarationId ?? null,
  });

  if (error) return { ok: false, message: `Log failed: ${error.message}` };

  // Every surface that reads training data has to re-derive: TEMPO on /now,
  // the radar on /hud, and the activity factor behind the macro targets.
  revalidatePath('/now');
  revalidatePath('/hud');
  revalidatePath('/fuel');

  return { ok: true, message: `${type.label} logged. ${load} AU.` };
}
