'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { DOWNGRADES, type DeclineReason, type Downgrade, type SlotKind } from '@/lib/slots';
import { clampRpe, sessionTypeFor, sessionTypeForDeclaration } from '@/lib/session';
import type { ActionResult } from './types';

export interface DeclarePayload {
  gymSlotId: string | null;
  /** 'class' comes from the timetable; 'floor' and 'cardio' do not. */
  kind?: SlotKind;
  className: string;
  /** Null for floor and cardio — nobody is expecting you at a squat rack. */
  coachName: string | null;
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

  // One declaration per fighter per start time is correct — nobody is on the
  // mats and under a barbell at once. What was wrong is that the upsert
  // replaced the existing row without saying so, which only became reachable
  // when floor sessions arrived: declare "Weights floor 19:30" on a Monday and
  // the 19:30 Muay Thai booking vanished silently, reminders and all.
  const { data: displaced } = await supabase
    .from('slot_declarations')
    .select('class_name')
    .eq('fighter_id', user.id)
    .eq('scheduled_for', payload.scheduledFor)
    .eq('status', 'declared')
    .maybeSingle();

  // Through the RPC, not the table. Members no longer hold INSERT on
  // slot_declarations: the policy at 002:92 checked WHO was writing and never
  // WHAT, so class_name and coach_name were free text. For a class the RPC now
  // takes the name, coach and duration FROM gym_slots and ignores whatever the
  // client sent — which is what stops a declaration asserting that a coach was
  // running a session they were not.
  const { error } = await supabase.rpc('declare_slot', {
    p_gym_slot_id: payload.gymSlotId,
    p_kind: payload.kind ?? 'class',
    p_class_name: payload.className,
    p_scheduled_for: payload.scheduledFor,
    p_duration_min: payload.durationMin,
  });

  if (error) return { ok: false, message: `Could not lock the slot: ${error.message}` };

  revalidatePath('/now');

  const replaced = displaced?.class_name && displaced.class_name !== payload.className;
  return {
    ok: true,
    message: replaced
      ? `${payload.className} locked in — replaces ${displaced!.class_name} at the same time.`
      : `${payload.className} locked in.`,
  };
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

  // The status='declared' guard now lives inside the RPC rather than in this
  // call, so it holds for any future caller too. Without it the whole action
  // replays on a double-tap: the row is rewritten and log_session called again.
  // The unique index kept the second session out of the log, but award_xp ran
  // regardless and paid for the class twice.
  const { data: rows, error } = await supabase.rpc('resolve_slot', {
    p_declaration_id: declarationId,
    p_status: outcome.kind,
    p_downgrade_to: outcome.kind === 'downgraded' ? outcome.downgrade : null,
    p_decline_reason: outcome.kind === 'declined' ? outcome.reason : null,
  });

  if (error) return { ok: false, message: `Could not resolve the slot: ${error.message}` };

  const updated = (Array.isArray(rows) ? rows[0] : rows) as
    | { class_name?: string; duration_min?: number; kind?: string; id?: string }
    | null;

  // No row matched: already resolved, by a double-tap or another tab. The
  // member's intent is satisfied either way, so this is a success, not an error.
  if (!updated) {
    return { ok: true, message: 'Already logged.' };
  }

  // ── make the copy true ─────────────────────────────────────────────────
  // "That is the one that counts" was previously false: resolving a slot
  // updated a status column and nothing else. TEMPO reads sessions, not
  // declarations, so attending the class you booked moved no metric, earned no
  // XP, and — because the macro targets read the session count — left the
  // member being fed as if they had trained nothing.
  if (outcome.kind !== 'declined') {
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
      : sessionTypeForDeclaration(
          (updated.kind as SlotKind | null) ?? 'class',
          className,
        );
    const minutes = isDowngrade ? (downgrade?.minutes ?? 20) : declaredMin;
    const rpe = clampRpe(outcome.rpe ?? (isDowngrade ? 4 : 6));

    // Deliberately non-fatal: the declaration is already resolved, and failing
    // the whole action here would tell the member their attendance did not
    // register when it did. log_session is idempotent per declaration — it
    // returns the fighter untouched on a replay rather than paying twice — so
    // this is safe to retry.
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
      // No "retry from the log" — /log redirects to /train, which passes no
      // declarationId, so there is no screen the member could follow that
      // advice to. Say what is true and leave it there.
      return {
        ok: true,
        message: `${copy[outcome.kind]} (The session itself did not record.)`,
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
