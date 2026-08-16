'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import type { BiologicalData } from '@/lib/types';
import { type ActionResult, DEMO_RESULT } from './types';

export interface InductionPayload {
  name: string;
  clanTag: string;
  biological: BiologicalData;
  medicalConditions: string[];
  goals: string[];
}

export async function completeInduction(payload: InductionPayload): Promise<ActionResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: true,
      demo: true,
      message: 'DEMO MODE — induction accepted locally. Connect Supabase to persist your fighter.',
    };
  }

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const name = payload.name.trim().slice(0, 40) || 'UNNAMED';
  const clan = payload.clanTag.trim().slice(0, 16).toUpperCase() || 'HYBRID';

  const { error } = await supabase.from('fighters').upsert(
    {
      id: user.id,
      name,
      clan_tag: clan,
      biological_data: payload.biological,
      medical_conditions: payload.medicalConditions.slice(0, 12),
      goals: payload.goals.slice(0, 8),
      onboarded: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) return { ok: false, message: `Induction failed: ${error.message}` };

  revalidatePath('/hud');
  return { ok: true, message: 'Fighter inducted. Welcome to the floor.' };
}

/**
 * Opt in (or out) of being visible to other members declaring the same session.
 *
 * Two things are deliberate. The nickname is a nickname, not the member's real
 * name — the point is to be recognisable to people who already train with you,
 * not identifiable to everyone. And opting out clears the flag but keeps the
 * nickname, so a member who changes their mind twice does not have to type it
 * again; nothing reads the column while the flag is false.
 */
export async function setGymVisibility(
  nickname: string,
  visible: boolean,
): Promise<ActionResult> {
  const clean = nickname.trim().slice(0, 24);
  if (visible && !clean) {
    return { ok: false, message: 'Pick a name your training partners would recognise.' };
  }

  if (!isSupabaseConfigured) {
    return { ok: true, demo: true, message: 'DEMO MODE — visibility saved.' };
  }

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { error } = await supabase
    .from('fighters')
    .update({ nickname: clean || null, visible_to_gym: visible, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return { ok: false, message: `Could not save that: ${error.message}` };

  revalidatePath('/now');
  return {
    ok: true,
    message: visible
      ? `Set. Classmates declaring the same session will see "${clean}".`
      : 'Set. You are not shown to anyone.',
  };
}

/*
 * logRestDay() lived here. It called the log_rest_day RPC, which awarded 40
 * recovery XP, wrote no row anywhere, and returned "Streak intact — go eat
 * something."
 *
 * Its only caller was <StreakTracker>, which was imported by /hud but never
 * rendered — so no member could reach it, and the XP it granted was the one
 * component of total_xp that could not be reconstructed from any table.
 * Removing it is what makes migration 010's drift report interpretable.
 * Migration 012 revokes the RPC.
 */
