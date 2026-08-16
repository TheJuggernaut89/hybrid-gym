import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/config';
import { xpFromHome, xpFromOcr } from './xp';
import {
  DEMO_BOUNTIES,
  DEMO_DECLARATIONS,
  DEMO_FIGHTER,
  DEMO_GYM_SLOTS,
  DEMO_HOME_SESSIONS,
  DEMO_NUTRITION,
  DEMO_TECHNIQUE_PROGRESS,
  DEMO_TRAINING_SESSIONS,
  DEMO_WORKOUTS,
} from './demo';
import type { GymSlot, SlotDeclaration } from './slots';
import type { TechniqueProgress } from './ladder';
import type {
  Bounty,
  Fighter,
  HomeSession,
  NutritionLog,
  TrainingSession,
  WorkoutLog,
} from './types';

export interface HudSnapshot {
  demo: boolean;
  fighter: Fighter;
  workouts: WorkoutLog[];
  homeSessions: HomeSession[];
  /**
   * Classes, lifts and mat time. Omitted from this snapshot until now, which
   * meant every screen fed by it — the combat log, the bounties, the activity
   * multiplier behind the macro targets — behaved as if a member who only
   * attends classes had never trained.
   */
  trainingSessions: TrainingSession[];
  nutrition: NutritionLog[];
  bounties: Bounty[];
}

export async function getAuthedUserId(): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Loads the fighter row. Returns null when authenticated but not yet
 * onboarded so callers can redirect to /onboarding.
 */
export async function getFighter(): Promise<Fighter | null> {
  if (!isSupabaseConfigured) return DEMO_FIGHTER;
  const supabase = createClient();
  if (!supabase) return DEMO_FIGHTER;

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data } = await supabase
    .from('fighters')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return (data as Fighter | null) ?? null;
}

/** A session reduced to what load management and the offers layer need. */
export interface LoadedSession {
  created_at: string;
  load: number;
  stat: string;
}

export interface NowSnapshot {
  demo: boolean;
  fighter: Fighter;
  /** ISO timestamps of every logged session, for TEMPO. */
  sessionDates: string[];
  totalSessions: number;
  shieldsSpent: number;
  /**
   * `covers_date` of every spent shield — the first day of each protected week.
   * TEMPO needs the dates, not just the count: a shield that does not change a
   * number the member can see is an acknowledgement, not a mechanic.
   */
  shieldCovers: string[];
  declarations: SlotDeclaration[];
  gymSlots: GymSlot[];
  /** Every session on the shared load scale, for computeLoad/modalityMix. */
  loads: LoadedSession[];
  /** Decline reasons in the trailing 28 days — drives the schedule-fix offer. */
  declineReasons: string[];
  /** Classes included per week by the member's tier. Null = unlimited. */
  classQuota: number | null;
  classesUsed: number;
}

export async function getNowSnapshot(): Promise<NowSnapshot | null> {
  if (!isSupabaseConfigured) {
    const sessionDates = [
      ...DEMO_WORKOUTS.map((w) => w.created_at),
      ...DEMO_HOME_SESSIONS.map((h) => h.created_at),
      // Backfill both TEMPO windows so the demo shows a real trend rather than
      // a nonsensical "+4.0 vs prev" against an empty prior window.
      // Current 28d: ~16 sessions (4.0/wk). Prior 28d: 13 (3.25/wk) => climbing.
      ...Array.from({ length: 11 }, (_, i) =>
        new Date(Date.now() - (4 + i * 2.2) * 86_400_000).toISOString(),
      ),
      ...Array.from({ length: 13 }, (_, i) =>
        new Date(Date.now() - (29 + i * 2) * 86_400_000).toISOString(),
      ),
    ];
    // Demo member trains almost entirely conditioning — which is exactly the
    // shape that should produce a "you have not trained X" recommendation, so
    // the offers layer is visible without Supabase.
    const loads: LoadedSession[] = sessionDates.map((d, i) => ({
      created_at: d,
      load: 240 + ((i * 37) % 180),
      stat: i % 7 === 0 ? 'craft' : 'engine',
    }));

    return {
      demo: true,
      fighter: DEMO_FIGHTER,
      sessionDates,
      totalSessions: sessionDates.length,
      shieldsSpent: 1,
      shieldCovers: [],
      declarations: DEMO_DECLARATIONS,
      gymSlots: DEMO_GYM_SLOTS,
      loads,
      declineReasons: DEMO_DECLARATIONS.filter(
        (d) => d.status === 'declined' && d.declineReason,
      ).map((d) => String(d.declineReason)),
      classQuota: null,
      classesUsed: 0,
    };
  }

  const supabase = createClient();
  if (!supabase) return null;

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const since = new Date(Date.now() - 70 * 86_400_000).toISOString();

  const [fighterRes, workoutRes, homeRes, trainingRes, declRes, slotRes, spendRes] =
    await Promise.all([
      supabase.from('fighters').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('workout_logs').select('created_at, active_minutes').eq('fighter_id', user.id).gte('created_at', since),
      supabase
        .from('home_sessions')
        .select('created_at, duration_seconds, form_accuracy_score')
        .eq('fighter_id', user.id)
        .gte('created_at', since),
      // The universal session table. Omitting this was the whole point of
      // adding it — without it TEMPO still cannot see the weights floor.
      supabase
        .from('training_sessions')
        .select('created_at, load_au, stat')
        .eq('fighter_id', user.id)
        .gte('created_at', since),
      supabase
        .from('slot_declarations')
        .select('*')
        .eq('fighter_id', user.id)
        .gte('scheduled_for', new Date(Date.now() - 28 * 86_400_000).toISOString())
        .order('scheduled_for'),
      supabase.from('gym_slots').select('*').eq('active', true).order('day_of_week'),
      // covers_date, not just a count: computeTempo discounts the week each
      // spend names, so it needs the dates themselves.
      supabase.from('shield_spends').select('covers_date').eq('fighter_id', user.id),
    ]);

  const fighter = fighterRes.data as Fighter | null;
  if (!fighter) return null;

  const sessionDates = [
    ...(workoutRes.data ?? []).map((r) => r.created_at as string),
    ...(homeRes.data ?? []).map((r) => r.created_at as string),
    ...(trainingRes.data ?? []).map((r) => r.created_at as string),
  ];

  // Every source contributes load on the same scale, so the console and drill
  // paths are converted rather than excluded — otherwise load management would
  // only see the modalities that happen to go through /log.
  const loads: LoadedSession[] = [
    ...(trainingRes.data ?? []).map((r) => ({
      created_at: String(r.created_at),
      load: Number(r.load_au) || 0,
      stat: String(r.stat),
    })),
    ...(workoutRes.data ?? []).map((r) => ({
      created_at: String(r.created_at),
      load: xpFromOcr({ activeMinutes: Number(r.active_minutes) || 0 }),
      stat: 'engine',
    })),
    ...(homeRes.data ?? []).map((r) => ({
      created_at: String(r.created_at),
      load: xpFromHome({
        accuracy: Number(r.form_accuracy_score) || 0,
        durationSeconds: Number(r.duration_seconds) || 0,
      }),
      stat: 'craft',
    })),
  ];

  const declarations = (declRes.data ?? []).map(mapDeclaration);

  return {
    demo: false,
    fighter,
    sessionDates,
    totalSessions: sessionDates.length,
    shieldsSpent: (spendRes.data ?? []).length,
    shieldCovers: (spendRes.data ?? [])
      .map((r) => String((r as { covers_date?: unknown }).covers_date ?? ''))
      .filter(Boolean),
    declarations,
    gymSlots: (slotRes.data ?? []).map(mapGymSlot),
    loads,
    declineReasons: declarations
      .filter((d) => d.status === 'declined' && d.declineReason)
      .map((d) => String(d.declineReason)),
    classQuota:
      (fighter as Fighter & { class_quota?: number | null }).class_quota ?? null,
    classesUsed: countClassesThisWeek(declarations),
  };
}

/**
 * Honoured CLASS declarations inside the trailing 7 days.
 *
 * The `kind` filter is load-bearing. This number feeds `classesUsed` into the
 * tier-upgrade offer, which fires when a member has consumed the class
 * allowance on their membership. Counting every honoured declaration would
 * mean a lifter who declared three floor sessions got told he had used up his
 * classes and shown an upsell for a thing he does not do.
 */
function countClassesThisWeek(declarations: SlotDeclaration[]): number {
  const since = Date.now() - 7 * 86_400_000;
  return declarations.filter(
    (d) =>
      d.kind === 'class' &&
      (d.status === 'honoured' || d.status === 'downgraded') &&
      new Date(d.scheduledFor).getTime() >= since,
  ).length;
}

/**
 * Nicknames of opted-in members who have declared sessions in a window,
 * keyed by ISO start time.
 *
 * The cohort floor lives in the RPC, not here — a client-side threshold is a
 * suggestion. Below it the RPC returns no rows for that session at all, which
 * is why this map is sparse rather than full of empty arrays.
 */
export async function getGymMates(
  from: Date,
  to: Date,
): Promise<Record<string, string[]>> {
  if (!isSupabaseConfigured) return {};
  const supabase = createClient();
  if (!supabase) return {};

  const { data, error } = await supabase.rpc('gym_mates', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  // Non-fatal by design: THE NOD is an embellishment on the declare list, and
  // failing the whole page because a social nicety errored would be absurd.
  if (error || !data) return {};

  const out: Record<string, string[]> = {};
  for (const r of data as Row[]) {
    const key = new Date(String(r.scheduled_for)).toISOString();
    const nick = String(r.nickname ?? '').trim();
    if (!nick) continue;
    (out[key] ??= []).push(nick);
  }
  return out;
}

export interface Occupancy {
  taken: number;
  capacity: number;
}

/**
 * Seat counts for capped classes, keyed by ISO start time.
 *
 * Sparse: a class with no capacity set has no occurrence row and appears here
 * not at all, which is the inert default.
 */
export async function getOccupancy(
  from: Date,
  to: Date,
): Promise<Record<string, Occupancy>> {
  if (!isSupabaseConfigured) return {};
  const supabase = createClient();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('class_occurrences')
    .select('gym_slot_id, starts_at, capacity, taken')
    .gte('starts_at', from.toISOString())
    .lte('starts_at', to.toISOString());

  if (error || !data) return {};

  const out: Record<string, Occupancy> = {};
  for (const r of data as Row[]) {
    const key = `${String(r.gym_slot_id)}@${new Date(String(r.starts_at)).toISOString()}`;
    out[key] = { taken: Number(r.taken) || 0, capacity: Number(r.capacity) || 0 };
  }
  return out;
}

export interface RosterEntry {
  fighterId: string;
  name: string;
  daysSinceLast: number | null;
  sessions28d: number;
  memberSince: string;
}

/** Null when the caller is not a coach — the RPC refuses, and that is the answer. */
export async function getCoachRoster(): Promise<RosterEntry[] | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('coach_roster');
  if (error || !data) return null;

  return (data as Row[]).map((r) => ({
    fighterId: String(r.fighter_id),
    name: String(r.name),
    daysSinceLast: r.days_since_last == null ? null : Number(r.days_since_last),
    sessions28d: Number(r.sessions_28d) || 0,
    memberSince: String(r.member_since ?? ''),
  }));
}

/** Postgres rows arrive snake_cased and loosely typed; narrow at the boundary. */
type Row = Record<string, unknown>;

function mapDeclaration(r: Row): SlotDeclaration {
  return {
    id: String(r.id),
    gymSlotId: (r.gym_slot_id as string | null) ?? null,
    kind: ((r.kind as SlotDeclaration['kind']) ?? 'class'),
    className: String(r.class_name),
    coachName: r.coach_name == null ? null : String(r.coach_name),
    scheduledFor: String(r.scheduled_for),
    durationMin: Number(r.duration_min),
    status: r.status as SlotDeclaration['status'],
    downgradeTo: (r.downgrade_to as SlotDeclaration['downgradeTo']) ?? null,
    declineReason: (r.decline_reason as SlotDeclaration['declineReason']) ?? null,
  };
}

function mapGymSlot(r: Row): GymSlot {
  return {
    id: String(r.id),
    code: String(r.code),
    dayOfWeek: Number(r.day_of_week),
    startTime: String(r.start_time).slice(0, 5),
    durationMin: Number(r.duration_min),
    className: String(r.class_name),
    coachName: String(r.coach_name),
  };
}

/** Per-technique ladder state, keyed by drill id. */
export async function getTechniqueProgress(): Promise<Record<string, TechniqueProgress>> {
  if (!isSupabaseConfigured) return DEMO_TECHNIQUE_PROGRESS;

  const supabase = createClient();
  if (!supabase) return {};

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return {};

  const { data } = await supabase
    .from('technique_progress')
    .select('*')
    .eq('fighter_id', user.id);

  const out: Record<string, TechniqueProgress> = {};
  for (const r of (data ?? []) as Row[]) {
    const drillId = String(r.drill_id);
    out[drillId] = {
      drillId,
      stage: r.stage as TechniqueProgress['stage'],
      cleanRun: Number(r.clean_run),
      probesPassed: Number(r.probes_passed),
      probesFailed: Number(r.probes_failed),
      bestScore: Number(r.best_score),
      lastScore: r.last_score === null ? null : Number(r.last_score),
      sessions: Number(r.sessions),
    };
  }
  return out;
}

/**
 * Just the declared conditions — the capture screens need these to vet the
 * vision model's output, and pulling a whole HUD snapshot for one column is
 * wasteful. Fails closed to `[]`: no conditions means no flags, never a wrong one.
 */
export async function getDeclaredConditions(): Promise<string[]> {
  if (!isSupabaseConfigured) return DEMO_FIGHTER.medical_conditions ?? [];

  const supabase = createClient();
  if (!supabase) return [];

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  const { data } = await supabase
    .from('fighters')
    .select('medical_conditions')
    .eq('id', user.id)
    .maybeSingle();

  const raw = (data as Row | null)?.medical_conditions;
  return Array.isArray(raw) ? raw.map(String) : [];
}

/**
 * Sessions logged in the trailing 7 days — drives the activity multiplier that
 * sets the macro targets.
 *
 * training_sessions was missing from this sum, so a member whose training is
 * classes and the weights floor — the majority — was counted as sedentary and
 * fed roughly 500 kcal/day short of maintenance. The one modality the gym most
 * wants people doing was the one the calculation could not see.
 */
export function sessionsThisWeek(snapshot: HudSnapshot): number {
  const since = Date.now() - 7 * 86_400_000;
  const count = <T extends { created_at: string }>(rows: T[]) =>
    rows.filter((r) => new Date(r.created_at).getTime() >= since).length;
  return (
    count(snapshot.workouts) +
    count(snapshot.homeSessions) +
    count(snapshot.trainingSessions)
  );
}

export async function getHudSnapshot(): Promise<HudSnapshot | null> {
  if (!isSupabaseConfigured) {
    return {
      demo: true,
      fighter: DEMO_FIGHTER,
      workouts: DEMO_WORKOUTS,
      homeSessions: DEMO_HOME_SESSIONS,
      trainingSessions: DEMO_TRAINING_SESSIONS,
      nutrition: DEMO_NUTRITION,
      bounties: DEMO_BOUNTIES,
    };
  }

  const supabase = createClient();
  if (!supabase) return null;

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [fighterRes, workoutRes, homeRes, trainingRes, nutritionRes, bountyRes] =
    await Promise.all([
    supabase.from('fighters').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('workout_logs')
      .select('*')
      .eq('fighter_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('home_sessions')
      .select('*')
      .eq('fighter_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('training_sessions')
      .select('*')
      .eq('fighter_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('nutrition_logs')
      .select('*')
      .eq('fighter_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('bounties').select('*').eq('active', true).order('created_at'),
  ]);

  const fighter = fighterRes.data as Fighter | null;
  if (!fighter) return null;

  return {
    demo: false,
    fighter,
    workouts: (workoutRes.data ?? []) as WorkoutLog[],
    homeSessions: (homeRes.data ?? []) as HomeSession[],
    trainingSessions: (trainingRes.data ?? []) as TrainingSession[],
    nutrition: (nutritionRes.data ?? []) as NutritionLog[],
    bounties: (bountyRes.data ?? []) as Bounty[],
  };
}
