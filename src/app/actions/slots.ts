'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { DOWNGRADES, type DeclineReason, type Downgrade } from '@/lib/slots';
import { clampRpe, sessionTypeFor, sessionTypeForClass } from '@/lib/session';
import type { ActionResult } from './types';

export interface DeclarePayload {
  gymSlotId: string | null;
  className: string;
  coachName: string;
  /** ISO timestamp of the session start. */
  scheduledFor: string;
  durationMin: number;
}

export async function declareSlot(payload: DeclarePayload): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: true,
      demo: true,
      message: `DEMO MODE — ${payload.className} locked in. Connect Supabase to persist.`,
    };
  }

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { error } = await supabase.from('slot_declarations').upsert(
    {
      fighter_id: user.id,
      gym_slot_id: payload.gymSlotId,
      class_name: payload.className,
      coach_name: payload.coachName,
      scheduled_for: payload.scheduledFor,
      duration_min: payload.durationMin,
      status: 'declared',
      downgrade_to: null,
      decline_reason: null,
      resolved_at: null,
    },
    { onConflict: 'fighter_id,scheduled_for' },
  );

  if (error) return { ok: false, message: `Could not lock the slot: ${error.message}` };

  revalidatePath('/now');
  return { ok: true, message: `${payload.className} locked in.` };
}

export type SlotOutcome =
  | { kind: 'honoured'; rpe?: number }
  | { kind: 'downgraded'; downgrade: Downgrade; rpe?: number }
  | { kind: 'declined'; reason: DeclineReason };

export async function resolveSlot(
  declarationId: string,
  outcome: SlotOutcome,
): Promise<ActionResult> {
  const copy: Record<SlotOutcome['kind'], string> = {
    honoured: 'Logged. That is the one that counts.',
    downgraded: 'Downgrade taken. Still a session — tempo holds.',
    declined: 'Noted. Reason logged, no lecture.',
  };

  if (!isSupabaseConfigured) {
    return { ok: true, demo: true, message: `DEMO MODE — ${copy[outcome.kind]}` };
  }

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data: updated, error } = await supabase
    .from('slot_declarations')
    .update({
      status: outcome.kind,
      downgrade_to: outcome.kind === 'downgraded' ? outcome.downgrade : null,
      decline_reason: outcome.kind === 'declined' ? outcome.reason : null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', declarationId)
    .eq('fighter_id', user.id)
    .select('class_name, duration_min')
    .maybeSingle();

  if (error) return { ok: false, message: `Could not resolve the slot: ${error.message}` };

  // ── make the copy true ─────────────────────────────────────────────────
  // "That is the one that counts" was previously false: resolving a slot
  // updated a status column and nothing else. TEMPO reads sessions, not
  // declarations, so attending the class you booked moved no metric, earned no
  // XP, and — because the macro targets read the session count — left the
  // member being fed as if they had trained nothing.
  if (outcome.kind !== 'declined' && updated) {
    const className = String(updated.class_name ?? '');
    const declaredMin = Number(updated.duration_min) || 60;

    const isDowngrade = outcome.kind === 'downgraded';
    const downgrade = isDowngrade
      ? DOWNGRADES.find((d) => d.code === outcome.downgrade)
      : undefined;

    // A downgrade is a real but deliberately smaller session — it must count,
    // and it must not count the same as the full class.
    const type = isDowngrade
      ? sessionTypeFor(downgrade?.code === 'mobility_8' ? 'mobility' : 'skill')!
      : sessionTypeForClass(className);
    const minutes = isDowngrade ? (downgrade?.minutes ?? 20) : declaredMin;
    const rpe = clampRpe(outcome.rpe ?? (isDowngrade ? 4 : 6));

    // Deliberately non-fatal: the declaration is already resolved, and failing
    // the whole action here would tell the member their attendance did not
    // register when it did. The unique index on declaration_id makes this safe
    // to retry.
    const { error: sessionError } = await supabase.rpc('log_session', {
      p_fighter_id: user.id,
      p_session_type: type.id,
      p_stat: type.stat,
      p_duration_min: minutes,
      p_rpe: rpe,
      p_label: isDowngrade ? (downgrade?.label ?? 'Downgrade') : className,
      p_declaration_id: declarationId,
    });

    if (sessionError) {
      return {
        ok: true,
        message: `${copy[outcome.kind]} (Session did not record — retry from the log.)`,
      };
    }
  }

  revalidatePath('/now');
  revalidatePath('/hud');
  revalidatePath('/fuel');
  return { ok: true, message: copy[outcome.kind] };
}

/**
 * Shields are spent deliberately and with a stated reason — that friction is
 * the mechanism, not an oversight.
 */
export async function spendShield(reason: string, coversDate: string): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return { ok: true, demo: true, message: 'DEMO MODE — shield spent. Week protected.' };
  }

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { error } = await supabase.rpc('spend_shield', {
    p_fighter_id: user.id,
    p_reason: reason,
    p_covers: coversDate,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath('/now');
  revalidatePath('/hud');
  return { ok: true, message: 'Shield spent. Week protected.' };
}
