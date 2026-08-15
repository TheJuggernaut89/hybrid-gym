'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { XP_NUTRITION_LOG, statForEquipment, xpFromOcr } from '@/lib/xp';
import type { EquipmentOcrData, NutritionVisionData } from '@/lib/types';
import { type ActionResult, DEMO_RESULT } from './types';

export async function saveEquipmentLog(
  data: EquipmentOcrData,
  coachComment: string,
): Promise<ActionResult> {
  // Calories stay on the record as metadata, but they no longer drive the
  // score — duration and effort do. See the note on xpFromOcr.
  const xp = xpFromOcr({ activeMinutes: data.active_minutes });

  if (!isSupabaseConfigured) return DEMO_RESULT(xp);

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { error: insertError } = await supabase.from('workout_logs').insert({
    fighter_id: user.id,
    equipment_type: data.equipment_type,
    raw_ocr_data: data as unknown as Record<string, unknown>,
    calories: data.calories,
    active_minutes: data.active_minutes,
    distance_m: data.distance_m,
    xp_awarded: xp,
    coach_comment: coachComment,
  });
  if (insertError) return { ok: false, message: `Log failed: ${insertError.message}` };

  const { data: fighter, error: xpError } = await supabase.rpc('award_xp', {
    p_fighter_id: user.id,
    p_stat: statForEquipment(data.equipment_type),
    p_amount: xp,
    p_rest_day: false,
  });
  if (xpError) return { ok: false, message: `XP award failed: ${xpError.message}` };

  revalidatePath('/hud');
  return {
    ok: true,
    xp,
    level: (fighter as { level?: number } | null)?.level,
    message: `Loot banked. +${xp} XP.`,
  };
}

export async function saveNutritionLog(
  data: NutritionVisionData,
  coachComment: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured) return DEMO_RESULT(XP_NUTRITION_LOG);

  const supabase = createClient();
  if (!supabase) return { ok: false, message: 'Supabase client unavailable.' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { error: insertError } = await supabase.from('nutrition_logs').insert({
    fighter_id: user.id,
    dish_name: data.dish_name,
    calories: data.calories,
    protein_g: data.protein_g,
    carbs_g: data.carbs_g,
    fats_g: data.fats_g,
    portion_note: data.portion_note,
    coach_comment: coachComment,
    raw_vision: data as unknown as Record<string, unknown>,
  });
  if (insertError) return { ok: false, message: `Log failed: ${insertError.message}` };

  const { data: fighter, error: xpError } = await supabase.rpc('award_xp', {
    p_fighter_id: user.id,
    p_stat: 'recovery',
    p_amount: XP_NUTRITION_LOG,
    p_rest_day: false,
  });
  if (xpError) return { ok: false, message: `XP award failed: ${xpError.message}` };

  revalidatePath('/hud');
  return {
    ok: true,
    xp: XP_NUTRITION_LOG,
    level: (fighter as { level?: number } | null)?.level,
    message: `Meal logged. +${XP_NUTRITION_LOG} XP.`,
  };
}
