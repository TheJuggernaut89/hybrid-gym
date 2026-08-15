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

/** Rest days keep the streak alive and feed the recovery stat. */
export async function logRestDay(): Promise<ActionResult> {
  if (!isSupabaseConfigured) return DEMO_RESULT(40);

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data, error } = await supabase.rpc('log_rest_day', { p_fighter_id: user.id });
  if (error) return { ok: false, message: `Rest day failed: ${error.message}` };

  revalidatePath('/hud');
  return {
    ok: true,
    xp: 40,
    level: (data as { level?: number } | null)?.level,
    message: 'Recovery shield logged. Streak intact — go eat something.',
  };
}
