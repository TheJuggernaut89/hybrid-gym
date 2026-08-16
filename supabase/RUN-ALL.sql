-- ===========================================================================
-- HYBRID GYM — COMPLETE DATABASE SETUP
--
-- Paste this WHOLE file into the Supabase SQL Editor and press Run.
--
-- Every statement is idempotent, so if it fails partway you can fix the
-- problem and re-run the whole thing safely. Nothing is duplicated.
--
-- Expected result: "Success. No rows returned".
-- ===========================================================================


-- ###########################################################################
-- schema.sql
-- Base tables, RLS, award_xp, level_for_xp
-- ###########################################################################

-- ═══════════════════════════════════════════════════════════════════════════
--  HYBRID COMBATIVE — PLAYER HUD
--  Supabase / PostgreSQL schema. Run once in the SQL editor.
--  Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ─── 1. FIGHTERS ───────────────────────────────────────────────────────────
create table if not exists public.fighters (
  id                 uuid primary key references auth.users(id) on delete cascade,
  name               text not null default 'UNNAMED',
  clan_tag           text not null default 'HYBRID',
  level              int  not null default 1,
  total_xp           int  not null default 0,

  striking_xp        int  not null default 0,
  stamina_xp         int  not null default 0,
  strength_xp        int  not null default 0,
  agility_xp         int  not null default 0,
  recovery_xp        int  not null default 0,

  streak_count       int  not null default 0,
  rest_shields       int  not null default 2,
  last_active_date   date,

  biological_data    jsonb    not null default '{}'::jsonb,   -- {age, sex, height_cm, weight_kg}
  medical_conditions text[]   not null default '{}',
  goals              text[]   not null default '{}',

  onboarded          boolean  not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─── 2. WORKOUT LOGS (Gym Mode / Equipment OCR) ────────────────────────────
create table if not exists public.workout_logs (
  id             uuid primary key default gen_random_uuid(),
  fighter_id     uuid not null references public.fighters(id) on delete cascade,
  equipment_type text not null,                                -- assault_bike | rower | treadmill | ski_erg | other
  raw_ocr_data   jsonb not null default '{}'::jsonb,
  calories       numeric,
  active_minutes numeric,
  distance_m     numeric,
  xp_awarded     int  not null default 0,
  coach_comment  text,
  created_at     timestamptz not null default now()
);
create index if not exists workout_logs_fighter_created_idx
  on public.workout_logs (fighter_id, created_at desc);

-- ─── 3. HOME SESSIONS (Shadow Dojo / Form Engine) ──────────────────────────
create table if not exists public.home_sessions (
  id                  uuid primary key default gen_random_uuid(),
  fighter_id          uuid not null references public.fighters(id) on delete cascade,
  drill_name          text not null,
  rep_count           int  not null default 0,
  duration_seconds    int  not null default 0,
  form_accuracy_score numeric not null default 0,
  fatigue_zones       text[] not null default '{}',
  strain_flags        text[] not null default '{}',
  corrective_action   text,
  xp_awarded          int  not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists home_sessions_fighter_created_idx
  on public.home_sessions (fighter_id, created_at desc);

-- ─── 4. NUTRITION LOGS (Nutrition Vision) ──────────────────────────────────
create table if not exists public.nutrition_logs (
  id            uuid primary key default gen_random_uuid(),
  fighter_id    uuid not null references public.fighters(id) on delete cascade,
  dish_name     text not null,
  calories      numeric,
  protein_g     numeric,
  carbs_g       numeric,
  fats_g        numeric,
  portion_note  text,
  coach_comment text,
  raw_vision    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists nutrition_logs_fighter_created_idx
  on public.nutrition_logs (fighter_id, created_at desc);

-- ─── 5. BOUNTIES (gym-synced quests) ───────────────────────────────────────
create table if not exists public.bounties (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  title         text not null,
  description   text not null,
  target_metric text not null,      -- calories | active_minutes | sessions | home_sessions | accuracy_avg | streak
  target_value  numeric not null,
  xp_reward     int not null default 250,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

insert into public.bounties (code, title, description, target_metric, target_value, xp_reward) values
  ('WEEKLY_BURN',    'FURNACE PROTOCOL',  'Burn 2500 calories on gym equipment this week.',      'calories',      2500, 600),
  ('WEEKLY_MINUTES', 'TIME UNDER FIRE',   'Log 150 active minutes across any machine.',          'active_minutes', 150, 450),
  ('WEEKLY_FLOOR',   'FLOOR PRESENCE',    'Complete 4 scanned gym sessions.',                    'sessions',         4, 300),
  ('WEEKLY_SHADOW',  'SHADOW DISCIPLINE', 'Finish 5 home drills in the Shadow Dojo.',            'home_sessions',    5, 350),
  ('WEEKLY_FORM',    'CLEAN TECHNIQUE',   'Hold an 80% average form score across home drills.',  'accuracy_avg',    80, 500),
  ('STREAK_SEVEN',   'SEVEN DAY WAR',     'Keep a 7-day active streak alive.',                   'streak',           7, 700)
on conflict (code) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.fighters       enable row level security;
alter table public.workout_logs   enable row level security;
alter table public.home_sessions  enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.bounties       enable row level security;

drop policy if exists "fighter reads self"    on public.fighters;
drop policy if exists "fighter inserts self"  on public.fighters;
drop policy if exists "fighter updates self"  on public.fighters;
create policy "fighter reads self"   on public.fighters for select using  (auth.uid() = id);
create policy "fighter inserts self" on public.fighters for insert with check (auth.uid() = id);
create policy "fighter updates self" on public.fighters for update using  (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['workout_logs', 'home_sessions', 'nutrition_logs'] loop
    execute format('drop policy if exists "owner reads %1$s" on public.%1$I',   t);
    execute format('drop policy if exists "owner writes %1$s" on public.%1$I',  t);
    execute format('drop policy if exists "owner deletes %1$s" on public.%1$I', t);
    execute format(
      'create policy "owner reads %1$s" on public.%1$I for select using (auth.uid() = fighter_id)', t);
    execute format(
      'create policy "owner writes %1$s" on public.%1$I for insert with check (auth.uid() = fighter_id)', t);
    execute format(
      'create policy "owner deletes %1$s" on public.%1$I for delete using (auth.uid() = fighter_id)', t);
  end loop;
end $$;

drop policy if exists "bounties readable" on public.bounties;
create policy "bounties readable" on public.bounties for select using (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════════════════
--  XP ENGINE
--  Level = floor(0.1 * sqrt(total_xp)) + 1
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.level_for_xp(p_total_xp int)
returns int
language sql
immutable
as $$
  select floor(0.1 * sqrt(greatest(p_total_xp, 0)))::int + 1;
$$;

-- Awards XP to one stat, recomputes level, and advances the flexible streak.
-- Rest shields bridge gaps: a missed day is absorbed by a shield instead of
-- resetting the streak. One shield regenerates every 7 consecutive active days
-- (capped at 3).
create or replace function public.award_xp(
  p_fighter_id uuid,
  p_stat       text,
  p_amount     int,
  p_rest_day   boolean default false
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  f          public.fighters;
  gap_days   int;
  new_streak int;
  shields    int;
  today      date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised to award xp for this fighter';
  end if;

  if p_stat not in ('striking', 'stamina', 'strength', 'agility', 'recovery') then
    raise exception 'unknown stat: %', p_stat;
  end if;

  select * into f from public.fighters where id = p_fighter_id for update;
  if not found then
    raise exception 'fighter not found';
  end if;

  -- ── streak ──────────────────────────────────────────────────────────────
  shields := f.rest_shields;
  if f.last_active_date is null then
    new_streak := 1;
  else
    gap_days := today - f.last_active_date;
    if gap_days = 0 then
      new_streak := greatest(f.streak_count, 1);
    elsif gap_days = 1 then
      new_streak := f.streak_count + 1;
    else
      -- Days missed = gap_days - 1. Spend a shield per missed day if available.
      if shields >= (gap_days - 1) then
        shields := shields - (gap_days - 1);
        new_streak := f.streak_count + 1;
      else
        shields := 0;
        new_streak := 1;
      end if;
    end if;
  end if;

  -- Regenerate a shield on every 7th consecutive active day.
  if new_streak > 0 and new_streak % 7 = 0 and shields < 3 then
    shields := shields + 1;
  end if;

  update public.fighters
     set total_xp         = total_xp + greatest(p_amount, 0),
         striking_xp      = striking_xp + case when p_stat = 'striking' then greatest(p_amount, 0) else 0 end,
         stamina_xp       = stamina_xp  + case when p_stat = 'stamina'  then greatest(p_amount, 0) else 0 end,
         strength_xp      = strength_xp + case when p_stat = 'strength' then greatest(p_amount, 0) else 0 end,
         agility_xp       = agility_xp  + case when p_stat = 'agility'  then greatest(p_amount, 0) else 0 end,
         recovery_xp      = recovery_xp + case when p_stat = 'recovery' then greatest(p_amount, 0) else 0 end,
         level            = public.level_for_xp(total_xp + greatest(p_amount, 0)),
         streak_count     = new_streak,
         rest_shields     = shields,
         last_active_date = today,
         updated_at       = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end;
$$;

revoke all on function public.award_xp(uuid, text, int, boolean) from public;
grant execute on function public.award_xp(uuid, text, int, boolean) to authenticated;

-- Logs a rest day: keeps the streak alive without awarding stat XP.
create or replace function public.log_rest_day(p_fighter_id uuid)
returns public.fighters
language sql
security definer
set search_path = public
as $$
  select public.award_xp(p_fighter_id, 'recovery', 40, true);
$$;

revoke all on function public.log_rest_day(uuid) from public;
grant execute on function public.log_rest_day(uuid) to authenticated;

-- ─── auto-create a stub fighter row on signup ──────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fighters (id, name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'UNNAMED'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ###########################################################################
-- 002_slots_and_shields.sql
-- Timetable, slot declarations, shield ledger
-- ###########################################################################

-- ═══════════════════════════════════════════════════════════════════════════
--  002 — THE SLOT + reworked rest shields
--  Additive and idempotent. Run after schema.sql.
--
--  TEMPO needs no migration: it is derived from existing session timestamps.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── gym timetable ─────────────────────────────────────────────────────────
create table if not exists public.gym_slots (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  day_of_week  int  not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time   time not null,
  duration_min int  not null default 60,
  class_name   text not null,
  coach_name   text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

insert into public.gym_slots (code, day_of_week, start_time, duration_min, class_name, coach_name) values
  ('MON-MT-1930',  1, '19:30', 60, 'Muay Thai',        'Coach Faiz'),
  ('TUE-BOX-0700', 2, '07:00', 60, 'Boxing',           'Coach Ridzuan'),
  ('TUE-COND-1930',2, '19:30', 45, 'Conditioning',     'Coach Ash'),
  ('WED-MT-1930',  3, '19:30', 60, 'Muay Thai',        'Coach Faiz'),
  ('THU-BJJ-2000', 4, '20:00', 75, 'BJJ Fundamentals', 'Coach Wei'),
  ('FRI-BOX-1930', 5, '19:30', 60, 'Boxing',           'Coach Ridzuan'),
  ('SAT-SPAR-1000',6, '10:00', 90, 'Open Sparring',    'Coach Faiz'),
  ('SUN-COND-0900',0, '09:00', 45, 'Conditioning',     'Coach Ash')
on conflict (code) do nothing;

-- ─── declared intentions ───────────────────────────────────────────────────
create table if not exists public.slot_declarations (
  id             uuid primary key default gen_random_uuid(),
  fighter_id     uuid not null references public.fighters(id) on delete cascade,
  gym_slot_id    uuid references public.gym_slots(id) on delete set null,
  class_name     text not null,
  coach_name     text not null,
  scheduled_for  timestamptz not null,
  duration_min   int  not null default 60,
  status         text not null default 'declared'
                 check (status in ('declared','honoured','downgraded','declined','lapsed')),
  downgrade_to   text check (downgrade_to in ('dojo_20','mobility_8')),
  -- The decline-reason log. This is the dataset nobody else in this market has.
  decline_reason text check (decline_reason in ('kerja','penat','sakit','jam','family')),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index if not exists slot_declarations_fighter_sched_idx
  on public.slot_declarations (fighter_id, scheduled_for desc);

-- One declaration per fighter per start time — re-declaring the same slot updates.
create unique index if not exists slot_declarations_unique_slot
  on public.slot_declarations (fighter_id, scheduled_for);

-- ─── shield ledger ─────────────────────────────────────────────────────────
-- Shields are now MINTED by work (every 5th session) and SPENT deliberately.
-- `rest_shields` on fighters becomes a cache; this table is the audit trail.
create table if not exists public.shield_spends (
  id          uuid primary key default gen_random_uuid(),
  fighter_id  uuid not null references public.fighters(id) on delete cascade,
  reason      text not null,
  covers_date date not null,
  created_at  timestamptz not null default now()
);

create index if not exists shield_spends_fighter_idx
  on public.shield_spends (fighter_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
--  RLS
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.gym_slots         enable row level security;
alter table public.slot_declarations enable row level security;
alter table public.shield_spends     enable row level security;

drop policy if exists "timetable readable" on public.gym_slots;
create policy "timetable readable" on public.gym_slots
  for select using (auth.role() = 'authenticated');

do $$
declare t text;
begin
  foreach t in array array['slot_declarations', 'shield_spends'] loop
    execute format('drop policy if exists "owner reads %1$s" on public.%1$I',   t);
    execute format('drop policy if exists "owner writes %1$s" on public.%1$I',  t);
    execute format('drop policy if exists "owner updates %1$s" on public.%1$I', t);
    execute format('drop policy if exists "owner deletes %1$s" on public.%1$I', t);
    execute format(
      'create policy "owner reads %1$s" on public.%1$I for select using (auth.uid() = fighter_id)', t);
    execute format(
      'create policy "owner writes %1$s" on public.%1$I for insert with check (auth.uid() = fighter_id)', t);
    execute format(
      'create policy "owner updates %1$s" on public.%1$I for update using (auth.uid() = fighter_id) with check (auth.uid() = fighter_id)', t);
    execute format(
      'create policy "owner deletes %1$s" on public.%1$I for delete using (auth.uid() = fighter_id)', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Shield spend — deliberate, reasoned, capped by what has been earned.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.spend_shield(
  p_fighter_id uuid,
  p_reason     text,
  p_covers     date
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  f            public.fighters;
  total_sess   int;
  spent        int;
  minted       int;
  available    int;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised to spend a shield for this fighter';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a shield must be spent with a stated reason';
  end if;

  select
    (select count(*) from public.workout_logs  where fighter_id = p_fighter_id)
  + (select count(*) from public.home_sessions where fighter_id = p_fighter_id)
    into total_sess;

  select count(*) into spent from public.shield_spends where fighter_id = p_fighter_id;

  minted    := floor(total_sess / 5);
  available := least(3, greatest(0, minted - spent));

  if available <= 0 then
    raise exception 'no shields available — 5 sessions mint one';
  end if;

  insert into public.shield_spends (fighter_id, reason, covers_date)
  values (p_fighter_id, btrim(p_reason), p_covers);

  update public.fighters
     set rest_shields = greatest(0, available - 1),
         updated_at   = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end;
$$;

revoke all on function public.spend_shield(uuid, text, date) from public;
grant execute on function public.spend_shield(uuid, text, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  award_xp v2 — shields now mint from session count, not streak days.
--
--  The old rule granted a free shield every 7 streak days. Slack that costs
--  nothing provides no persistence benefit, so shields are now earned by work
--  and spent through spend_shield() above. Streak bookkeeping is retained for
--  backwards compatibility but is no longer the headline metric — see
--  src/lib/tempo.ts.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.award_xp(
  p_fighter_id uuid,
  p_stat       text,
  p_amount     int,
  p_rest_day   boolean default false
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  f          public.fighters;
  gap_days   int;
  new_streak int;
  total_sess int;
  spent      int;
  available  int;
  today      date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised to award xp for this fighter';
  end if;

  if p_stat not in ('striking', 'stamina', 'strength', 'agility', 'recovery') then
    raise exception 'unknown stat: %', p_stat;
  end if;

  select * into f from public.fighters where id = p_fighter_id for update;
  if not found then
    raise exception 'fighter not found';
  end if;

  if f.last_active_date is null then
    new_streak := 1;
  else
    gap_days := today - f.last_active_date;
    if gap_days = 0 then
      new_streak := greatest(f.streak_count, 1);
    elsif gap_days = 1 then
      new_streak := f.streak_count + 1;
    else
      new_streak := 1;
    end if;
  end if;

  -- Recompute the shield bank from earned-minus-spent.
  select
    (select count(*) from public.workout_logs  where fighter_id = p_fighter_id)
  + (select count(*) from public.home_sessions where fighter_id = p_fighter_id)
    into total_sess;
  select count(*) into spent from public.shield_spends where fighter_id = p_fighter_id;
  available := least(3, greatest(0, floor(total_sess / 5) - spent));

  update public.fighters
     set total_xp         = total_xp + greatest(p_amount, 0),
         striking_xp      = striking_xp + case when p_stat = 'striking' then greatest(p_amount, 0) else 0 end,
         stamina_xp       = stamina_xp  + case when p_stat = 'stamina'  then greatest(p_amount, 0) else 0 end,
         strength_xp      = strength_xp + case when p_stat = 'strength' then greatest(p_amount, 0) else 0 end,
         agility_xp       = agility_xp  + case when p_stat = 'agility'  then greatest(p_amount, 0) else 0 end,
         recovery_xp      = recovery_xp + case when p_stat = 'recovery' then greatest(p_amount, 0) else 0 end,
         level            = public.level_for_xp(total_xp + greatest(p_amount, 0)),
         streak_count     = new_streak,
         rest_shields     = available,
         last_active_date = today,
         updated_at       = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end;
$$;

revoke all on function public.award_xp(uuid, text, int, boolean) from public;
grant execute on function public.award_xp(uuid, text, int, boolean) to authenticated;


-- ###########################################################################
-- 003_coaching_ladder.sql
-- Per-technique ladder state
-- ###########################################################################

-- ═══════════════════════════════════════════════════════════════════════════
--  003 — THE COACHING LADDER
--  Per-technique feedback state. Additive and idempotent.
--
--  Feedback fades as competence rises: ACQUIRE -> BANDWIDTH -> SUMMARY ->
--  SILENT_PROBE -> MASTERED. A technique is only mastered once it holds up with
--  the coach silent. State transitions live in src/lib/ladder.ts.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.technique_progress (
  id            uuid primary key default gen_random_uuid(),
  fighter_id    uuid not null references public.fighters(id) on delete cascade,
  drill_id      text not null,
  stage         text not null default 'ACQUIRE'
                check (stage in ('ACQUIRE','BANDWIDTH','SUMMARY','SILENT_PROBE','MASTERED')),
  clean_run     int  not null default 0,
  probes_passed int  not null default 0,
  probes_failed int  not null default 0,
  best_score    numeric not null default 0,
  last_score    numeric,
  sessions      int  not null default 0,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (fighter_id, drill_id)
);

create index if not exists technique_progress_fighter_idx
  on public.technique_progress (fighter_id);

alter table public.technique_progress enable row level security;

drop policy if exists "owner reads technique_progress"   on public.technique_progress;
drop policy if exists "owner writes technique_progress"  on public.technique_progress;
drop policy if exists "owner updates technique_progress" on public.technique_progress;

create policy "owner reads technique_progress" on public.technique_progress
  for select using (auth.uid() = fighter_id);
create policy "owner writes technique_progress" on public.technique_progress
  for insert with check (auth.uid() = fighter_id);
create policy "owner updates technique_progress" on public.technique_progress
  for update using (auth.uid() = fighter_id) with check (auth.uid() = fighter_id);

-- Record which ladder stage a session was performed under. Without this the
-- session log cannot distinguish "82% with cues" from "82% during a probe",
-- and those are very different results.
alter table public.home_sessions
  add column if not exists ladder_stage text
  check (ladder_stage in ('ACQUIRE','BANDWIDTH','SUMMARY','SILENT_PROBE','MASTERED'));


-- ###########################################################################
-- 004_universal_sessions.sql
-- Renames stat columns, adds training_sessions + log_session
-- ###########################################################################

-- ============================================================================
-- 004 — UNIVERSAL SESSIONS
--
-- Two changes, both fixing the same root problem: the app modelled a "session"
-- as a byproduct of a capture method (console OCR, or an on-device drill),
-- so every other kind of training in the building was invisible. A member on
-- the weights floor, in a spin class, or on the mats logged nothing, earned
-- nothing, and — because nutrition targets read the session count — was told
-- to eat as if sedentary.
--
--   1. Rename the combat-specific stat axes to trainable qualities.
--   2. Add `training_sessions`: one row per session, any modality, carrying
--      duration + RPE so load is comparable across the whole membership.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ── 1. stat axes: modalities -> trainable qualities ────────────────────────
-- striking -> craft, stamina -> engine, agility -> power.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'fighters'
               and column_name = 'striking_xp') then
    alter table public.fighters rename column striking_xp to craft_xp;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'fighters'
               and column_name = 'stamina_xp') then
    alter table public.fighters rename column stamina_xp to engine_xp;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'fighters'
               and column_name = 'agility_xp') then
    alter table public.fighters rename column agility_xp to power_xp;
  end if;
end $$;

-- ── 2. the universal session record ────────────────────────────────────────
create table if not exists public.training_sessions (
  id            uuid primary key default gen_random_uuid(),
  fighter_id    uuid not null references public.fighters(id) on delete cascade,

  -- Matches SESSION_TYPES in src/lib/session.ts.
  session_type  text not null check (session_type in
                  ('lift','conditioning','class','combat','skill','power','mobility')),
  stat          text not null check (stat in
                  ('craft','engine','strength','power','recovery')),

  duration_min  int  not null check (duration_min > 0 and duration_min <= 300),
  -- Borg CR10. The one intensity signal that works across every modality.
  rpe           int  not null check (rpe between 1 and 10),
  -- Denormalised session-RPE (duration x rpe). Stored rather than computed so
  -- load queries stay cheap and history is immutable if the formula changes.
  load_au       int  not null check (load_au >= 0),

  label         text,
  notes         text,

  -- Set when this session came from honouring a declared slot, so THE SLOT
  -- finally feeds the same pipeline as everything else.
  declaration_id uuid references public.slot_declarations(id) on delete set null,

  created_at    timestamptz not null default now()
);

create index if not exists training_sessions_fighter_created_idx
  on public.training_sessions (fighter_id, created_at desc);

-- One session per resolved declaration — resolving twice must not double-count.
create unique index if not exists training_sessions_declaration_uniq
  on public.training_sessions (declaration_id)
  where declaration_id is not null;

alter table public.training_sessions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'training_sessions'
                   and policyname = 'own_training_sessions') then
    create policy own_training_sessions on public.training_sessions
      for all
      using (auth.uid() = fighter_id)
      with check (auth.uid() = fighter_id);
  end if;
end $$;

-- ── 3. award_xp v3 ─────────────────────────────────────────────────────────
-- Two changes: the renamed stat axes, and shields that mint from ALL training
-- rather than only the two legacy capture paths. A member who lifts four times
-- a week previously earned no shields at all, because none of their work was
-- in workout_logs or home_sessions.
create or replace function public.award_xp(
  p_fighter_id uuid,
  p_stat       text,
  p_amount     int,
  p_rest_day   boolean default false
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  f          public.fighters;
  gap_days   int;
  new_streak int;
  total_sess int;
  spent      int;
  available  int;
  today      date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised to award xp for this fighter';
  end if;

  if p_stat not in ('craft', 'engine', 'strength', 'power', 'recovery') then
    raise exception 'unknown stat: %', p_stat;
  end if;

  select * into f from public.fighters where id = p_fighter_id for update;
  if not found then
    raise exception 'fighter not found';
  end if;

  if f.last_active_date is null then
    new_streak := 1;
  else
    gap_days := today - f.last_active_date;
    if gap_days = 0 then
      new_streak := greatest(f.streak_count, 1);
    elsif gap_days = 1 then
      new_streak := f.streak_count + 1;
    else
      new_streak := 1;
    end if;
  end if;

  select
    (select count(*) from public.workout_logs      where fighter_id = p_fighter_id)
  + (select count(*) from public.home_sessions     where fighter_id = p_fighter_id)
  + (select count(*) from public.training_sessions where fighter_id = p_fighter_id)
    into total_sess;
  select count(*) into spent from public.shield_spends where fighter_id = p_fighter_id;
  available := least(3, greatest(0, floor(total_sess / 5) - spent));

  update public.fighters
     set total_xp         = total_xp + greatest(p_amount, 0),
         craft_xp         = craft_xp    + case when p_stat = 'craft'    then greatest(p_amount, 0) else 0 end,
         engine_xp        = engine_xp   + case when p_stat = 'engine'   then greatest(p_amount, 0) else 0 end,
         strength_xp      = strength_xp + case when p_stat = 'strength' then greatest(p_amount, 0) else 0 end,
         power_xp         = power_xp    + case when p_stat = 'power'    then greatest(p_amount, 0) else 0 end,
         recovery_xp      = recovery_xp + case when p_stat = 'recovery' then greatest(p_amount, 0) else 0 end,
         level            = public.level_for_xp(total_xp + greatest(p_amount, 0)),
         streak_count     = new_streak,
         rest_shields     = available,
         last_active_date = today,
         updated_at       = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end $$;

revoke all on function public.award_xp(uuid, text, int, boolean) from public;
grant execute on function public.award_xp(uuid, text, int, boolean) to authenticated;

-- ── 4. log_session: insert + award XP atomically ───────────────────────────
-- XP is the session load itself. No per-modality multiplier: the moment COMBAT
-- is worth more than CLASS, the app is telling half the membership their
-- training counts less, which is the bug this migration exists to remove.
create or replace function public.log_session(
  p_fighter_id    uuid,
  p_session_type  text,
  p_stat          text,
  p_duration_min  int,
  p_rpe           int,
  p_label         text default null,
  p_declaration_id uuid default null
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_load    int;
  v_fighter public.fighters;
begin
  -- SECURITY DEFINER: re-check the caller owns this row rather than trusting
  -- the argument.
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised';
  end if;

  if p_rpe < 1 or p_rpe > 10 then
    raise exception 'rpe out of range';
  end if;
  if p_duration_min <= 0 or p_duration_min > 300 then
    raise exception 'duration out of range';
  end if;

  v_load := p_duration_min * p_rpe;

  insert into public.training_sessions
    (fighter_id, session_type, stat, duration_min, rpe, load_au, label, declaration_id)
  values
    (p_fighter_id, p_session_type, p_stat, p_duration_min, p_rpe, v_load, p_label, p_declaration_id)
  on conflict (declaration_id) where declaration_id is not null do nothing;

  select * into v_fighter
  from public.award_xp(p_fighter_id, p_stat, v_load, false);

  return v_fighter;
end $$;

revoke all on function public.log_session(uuid, text, text, int, int, text, uuid) from public;
grant execute on function public.log_session(uuid, text, text, int, int, text, uuid) to authenticated;


-- ###########################################################################
-- 005_shields_actually_protect.sql
-- Makes a spent shield actually protect the streak
-- ###########################################################################

-- ============================================================================
-- 005 — MAKE SHIELDS REAL
--
-- The app told members "Shield spent. Week protected." It was not.
--
-- `shield_spends.covers_date` was written by spend_shield() and then read by
-- nothing, anywhere. award_xp's streak branch was:
--
--     elsif gap_days = 1 then  new_streak := f.streak_count + 1;
--     else                     new_streak := 1;          -- <- no shield check
--
-- so a gap of two or more days reset the streak regardless of how many shields
-- had been spent to cover it. Spending a shield decremented a counter and had
-- no other effect in the system.
--
-- Two honest options: delete the feature, or make the copy true. Shields are
-- minted by work (every 5th session) and spent with a stated reason, which is
-- a mechanic worth keeping — so this makes it true.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- Covering the same date twice would let one absence be paid for repeatedly.
create unique index if not exists shield_spends_fighter_date_uniq
  on public.shield_spends (fighter_id, covers_date);

-- ── award_xp v4 ────────────────────────────────────────────────────────────
-- Identical to v3 except the streak branch now consults the shield ledger:
-- every day in the gap must be either covered by a spent shield or the streak
-- breaks. Partial cover is not cover — protecting Tuesday does not excuse
-- Wednesday.
create or replace function public.award_xp(
  p_fighter_id uuid,
  p_stat       text,
  p_amount     int,
  p_rest_day   boolean default false
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  f           public.fighters;
  gap_days    int;
  new_streak  int;
  total_sess  int;
  spent       int;
  available   int;
  covered     int;
  today       date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised to award xp for this fighter';
  end if;

  if p_stat not in ('craft', 'engine', 'strength', 'power', 'recovery') then
    raise exception 'unknown stat: %', p_stat;
  end if;

  select * into f from public.fighters where id = p_fighter_id for update;
  if not found then
    raise exception 'fighter not found';
  end if;

  if f.last_active_date is null then
    new_streak := 1;
  else
    gap_days := today - f.last_active_date;

    if gap_days = 0 then
      new_streak := greatest(f.streak_count, 1);
    elsif gap_days = 1 then
      new_streak := f.streak_count + 1;
    else
      -- Days strictly between the last active day and today are the ones that
      -- need covering. Count how many carry a spent shield.
      select count(*) into covered
      from public.shield_spends s
      where s.fighter_id = p_fighter_id
        and s.covers_date > f.last_active_date
        and s.covers_date < today;

      if covered >= gap_days - 1 then
        -- Every missed day was paid for. The streak survives the absence, and
        -- the covered days count toward it — that is what was bought.
        new_streak := f.streak_count + gap_days;
      else
        new_streak := 1;
      end if;
    end if;
  end if;

  select
    (select count(*) from public.workout_logs      where fighter_id = p_fighter_id)
  + (select count(*) from public.home_sessions     where fighter_id = p_fighter_id)
  + (select count(*) from public.training_sessions where fighter_id = p_fighter_id)
    into total_sess;
  select count(*) into spent from public.shield_spends where fighter_id = p_fighter_id;
  available := least(3, greatest(0, floor(total_sess / 5) - spent));

  update public.fighters
     set total_xp         = total_xp + greatest(p_amount, 0),
         craft_xp         = craft_xp    + case when p_stat = 'craft'    then greatest(p_amount, 0) else 0 end,
         engine_xp        = engine_xp   + case when p_stat = 'engine'   then greatest(p_amount, 0) else 0 end,
         strength_xp      = strength_xp + case when p_stat = 'strength' then greatest(p_amount, 0) else 0 end,
         power_xp         = power_xp    + case when p_stat = 'power'    then greatest(p_amount, 0) else 0 end,
         recovery_xp      = recovery_xp + case when p_stat = 'recovery' then greatest(p_amount, 0) else 0 end,
         level            = public.level_for_xp(total_xp + greatest(p_amount, 0)),
         streak_count     = new_streak,
         rest_shields     = available,
         last_active_date = today,
         updated_at       = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end $$;

revoke all on function public.award_xp(uuid, text, int, boolean) from public;
grant execute on function public.award_xp(uuid, text, int, boolean) to authenticated;

-- ── spend_shield: reject covering a day that is already spent or past ──────
-- Paying to protect a day that has already broken the streak is not a feature.
create or replace function public.spend_shield(
  p_fighter_id uuid,
  p_reason     text,
  p_covers     date
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  f          public.fighters;
  total_sess int;
  spent      int;
  available  int;
  today      date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'a shield needs a stated reason';
  end if;

  -- The friction is the mechanic: you cover a specific day, deliberately.
  if p_covers > today then
    raise exception 'cannot cover a day that has not happened yet';
  end if;
  if p_covers < today - 7 then
    raise exception 'that day is too far back to cover';
  end if;

  select
    (select count(*) from public.workout_logs      where fighter_id = p_fighter_id)
  + (select count(*) from public.home_sessions     where fighter_id = p_fighter_id)
  + (select count(*) from public.training_sessions where fighter_id = p_fighter_id)
    into total_sess;
  select count(*) into spent from public.shield_spends where fighter_id = p_fighter_id;
  available := least(3, greatest(0, floor(total_sess / 5) - spent));

  if available <= 0 then
    raise exception 'no shields available';
  end if;

  insert into public.shield_spends (fighter_id, reason, covers_date)
  values (p_fighter_id, btrim(p_reason), p_covers)
  on conflict (fighter_id, covers_date) do nothing;

  update public.fighters
     set rest_shields = greatest(0, available - 1),
         updated_at   = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end $$;

revoke all on function public.spend_shield(uuid, text, date) from public;
grant execute on function public.spend_shield(uuid, text, date) to authenticated;


-- ###########################################################################
-- 006_push_subscriptions.sql
-- Push subscription storage + due_slot_reminders()
-- ###########################################################################

-- ============================================================================
-- 006 — PUSH SUBSCRIPTIONS
--
-- The app had no way to reach a member. sw.js handled install/activate/fetch
-- and nothing else, so THE SLOT's whole phase machine — T-90 approaching,
-- T-30 imminent, the grace window afterwards — rendered only for someone who
-- had already opened the app.
--
-- That inverts the product's own thesis. The README argues the decisive moment
-- is when someone decides not to come; that person is not opening the app. A
-- pre-decision surface on a pull-only channel arrives only when the decision
-- already went the right way.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  fighter_id  uuid not null references public.fighters(id) on delete cascade,

  -- The endpoint IS the identity of a subscription, and it is unique per
  -- browser install. One member with a phone and a laptop has two rows.
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,

  user_agent  text,
  -- Cleared on a successful send, set when the push service reports the
  -- endpoint is gone. Lets a sender prune rather than retry forever.
  failed_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_fighter_idx
  on public.push_subscriptions (fighter_id);

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'push_subscriptions'
                   and policyname = 'own_push_subscriptions') then
    create policy own_push_subscriptions on public.push_subscriptions
      for all
      using (auth.uid() = fighter_id)
      with check (auth.uid() = fighter_id);
  end if;
end $$;

-- ── who needs reminding, and about what ────────────────────────────────────
-- Returns one row per (subscription, declaration) that is due a nudge.
--
-- Called by the scheduled sender with the service-role key, so it is NOT
-- exposed to authenticated clients — it deliberately reads across members.
create or replace function public.due_slot_reminders(p_now timestamptz default now())
returns table (
  fighter_id     uuid,
  declaration_id uuid,
  endpoint       text,
  p256dh         text,
  auth           text,
  class_name     text,
  coach_name     text,
  scheduled_for  timestamptz,
  phase          text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.fighter_id,
    d.id,
    s.endpoint,
    s.p256dh,
    s.auth,
    d.class_name,
    d.coach_name,
    d.scheduled_for,
    case
      when d.scheduled_for - p_now between interval '25 minutes' and interval '35 minutes'
        then 'imminent'
      else 'approaching'
    end as phase
  from public.slot_declarations d
  join public.push_subscriptions s
    on s.fighter_id = d.fighter_id
   and s.failed_at is null
  where d.status = 'declared'
    -- Two windows, matching slotPhase() in src/lib/slots.ts. The band is wide
    -- enough that a sender running every 5 minutes cannot skip one.
    and (
      d.scheduled_for - p_now between interval '85 minutes'  and interval '95 minutes'
      or
      d.scheduled_for - p_now between interval '25 minutes'  and interval '35 minutes'
    );
$$;

revoke all on function public.due_slot_reminders(timestamptz) from public;
revoke all on function public.due_slot_reminders(timestamptz) from authenticated;


-- ###########################################################################
-- 007_class_quota.sql
-- Per-member class allowance
-- ###########################################################################

-- ============================================================================
-- 007 — CLASS QUOTA
--
-- The offers layer can suggest a tier upgrade, but only once a member has
-- genuinely used up the classes their tier includes — never as a pre-emptive
-- nudge. That requires knowing the quota, and nothing in the schema did.
--
-- NULL means unlimited, which is also the default: until a gym actually
-- configures tiers, the upgrade offer simply never fires. That is the correct
-- failure mode for a commercial prompt — silent, not guessed.
-- ============================================================================

alter table public.fighters
  add column if not exists class_quota int
  check (class_quota is null or class_quota > 0);

comment on column public.fighters.class_quota is
  'Classes included per week by this member''s tier. NULL = unlimited; the tier-upgrade offer never fires while NULL.';


-- ###########################################################################
-- 008_lock_down_reminder_rpc.sql
-- SECURITY: stops anon reading push credentials
-- ###########################################################################

-- ============================================================================
-- 008 — LOCK DOWN due_slot_reminders()
--
-- SECURITY FIX. Migration 006 did:
--
--     revoke all on function public.due_slot_reminders(timestamptz) from public;
--     revoke all on function public.due_slot_reminders(timestamptz) from authenticated;
--
-- and stopped one role short. Supabase's bootstrap default privileges grant
-- EXECUTE on new functions in `public` to anon, authenticated AND service_role
-- as explicit grants — revoking from the PUBLIC pseudo-role does not remove an
-- explicit grant to `anon`.
--
-- The function is SECURITY DEFINER with no internal auth.uid() check (unlike
-- log_session, which gates on the caller), and it returns endpoint, p256dh and
-- auth for EVERY member with a subscription. The anon key ships inlined in the
-- client bundle, so anyone who loads the site could call
--
--     POST /rest/v1/rpc/due_slot_reminders
--
-- and walk away with the push credentials for the whole gym — enough to send
-- forged notifications to real members' devices.
--
-- This migration removes anon's access and makes service_role's access
-- explicit rather than inherited.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

revoke all on function public.due_slot_reminders(timestamptz) from anon;
revoke all on function public.due_slot_reminders(timestamptz) from public;
revoke all on function public.due_slot_reminders(timestamptz) from authenticated;

-- The scheduled sender is the only legitimate caller.
grant execute on function public.due_slot_reminders(timestamptz) to service_role;

-- Belt and braces: even if a future migration re-grants execute, the function
-- itself now refuses anyone who is not running as the service role. A
-- SECURITY DEFINER function that reads across every member should not depend
-- on GRANT hygiene alone.
create or replace function public.due_slot_reminders(p_now timestamptz default now())
returns table (
  fighter_id     uuid,
  declaration_id uuid,
  endpoint       text,
  p256dh         text,
  auth           text,
  class_name     text,
  coach_name     text,
  scheduled_for  timestamptz,
  phase          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for service_role (no end-user JWT) and non-null for any
  -- request carrying a user token. A logged-in member must never reach this.
  if auth.uid() is not null then
    raise exception 'not authorised';
  end if;

  return query
  select
    d.fighter_id,
    d.id,
    s.endpoint,
    s.p256dh,
    s.auth,
    d.class_name,
    d.coach_name,
    d.scheduled_for,
    case
      when d.scheduled_for - p_now between interval '25 minutes' and interval '35 minutes'
        then 'imminent'
      else 'approaching'
    end as phase
  from public.slot_declarations d
  join public.push_subscriptions s
    on s.fighter_id = d.fighter_id
   and s.failed_at is null
  where d.status = 'declared'
    and (
      d.scheduled_for - p_now between interval '85 minutes' and interval '95 minutes'
      or
      d.scheduled_for - p_now between interval '25 minutes' and interval '35 minutes'
    );
end $$;

revoke all on function public.due_slot_reminders(timestamptz) from anon;
revoke all on function public.due_slot_reminders(timestamptz) from public;
revoke all on function public.due_slot_reminders(timestamptz) from authenticated;
grant execute on function public.due_slot_reminders(timestamptz) to service_role;

-- Verify after applying:
--   select grantee, privilege_type from information_schema.role_routine_grants
--   where routine_name = 'due_slot_reminders';
-- Expect service_role only.


-- ###########################################################################
-- 009_fix_declaration_timezone.sql
-- REPAIR: declarations written 8 hours off by the UTC bug
-- ###########################################################################

-- Repair only; a fresh database has nothing to fix and this is a no-op. The
-- standalone migration also prints a report of rows it could not explain —
-- run that file directly if you are fixing an existing project.
--
-- Idempotent: after the first pass no row satisfies both predicates.
update public.slot_declarations d
   set scheduled_for = d.scheduled_for - interval '8 hours'
  from public.gym_slots g
 where d.gym_slot_id = g.id
   and d.status = 'declared'
   and (
     (d.scheduled_for at time zone 'Asia/Kuala_Lumpur')::time <> g.start_time
     or extract(dow from (d.scheduled_for at time zone 'Asia/Kuala_Lumpur')) <> g.day_of_week
   )
   and ((d.scheduled_for - interval '8 hours') at time zone 'Asia/Kuala_Lumpur')::time = g.start_time
   and extract(dow from ((d.scheduled_for - interval '8 hours') at time zone 'Asia/Kuala_Lumpur')) = g.day_of_week;


-- ###########################################################################
-- 010_xp_awarded_once.sql
-- BUGFIX: log_session paid for the same session on every replay
-- ###########################################################################

create or replace function public.log_session(
  p_fighter_id    uuid,
  p_session_type  text,
  p_stat          text,
  p_duration_min  int,
  p_rpe           int,
  p_label         text default null,
  p_declaration_id uuid default null
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_load       int;
  v_session_id uuid;
  v_fighter    public.fighters;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised';
  end if;

  if p_rpe < 1 or p_rpe > 10 then
    raise exception 'rpe out of range';
  end if;
  if p_duration_min <= 0 or p_duration_min > 300 then
    raise exception 'duration out of range';
  end if;

  v_load := p_duration_min * p_rpe;

  insert into public.training_sessions
    (fighter_id, session_type, stat, duration_min, rpe, load_au, label, declaration_id)
  values
    (p_fighter_id, p_session_type, p_stat, p_duration_min, p_rpe, v_load, p_label, p_declaration_id)
  on conflict (declaration_id) where declaration_id is not null do nothing
  returning id into v_session_id;

  -- Deduped by the partial unique index: already logged, already paid for.
  if v_session_id is null then
    select * into v_fighter from public.fighters where id = p_fighter_id;
    return v_fighter;
  end if;

  select * into v_fighter
  from public.award_xp(p_fighter_id, p_stat, v_load, false);

  return v_fighter;
end $$;

revoke all on function public.log_session(uuid, text, text, int, int, text, uuid) from public;
grant execute on function public.log_session(uuid, text, text, int, int, text, uuid) to authenticated;


-- ###########################################################################
-- 011_send_each_reminder_once.sql
-- BUGFIX: T-30 buzzed two or three times per class
-- ###########################################################################

create table if not exists public.slot_notifications (
  declaration_id uuid        not null references public.slot_declarations(id) on delete cascade,
  phase          text        not null check (phase in ('approaching', 'imminent')),
  endpoint       text        not null,
  sent_at        timestamptz not null default now(),
  primary key (declaration_id, phase, endpoint)
);

alter table public.slot_notifications enable row level security;
revoke all on table public.slot_notifications from anon, authenticated;

create or replace function public.due_slot_reminders(p_now timestamptz default now())
returns table (
  fighter_id     uuid,
  declaration_id uuid,
  endpoint       text,
  p256dh         text,
  auth           text,
  class_name     text,
  coach_name     text,
  scheduled_for  timestamptz,
  phase          text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'not authorised';
  end if;

  return query
  with due as (
    select
      d.fighter_id    as fighter_id,
      d.id            as declaration_id,
      s.endpoint      as endpoint,
      s.p256dh        as p256dh,
      s.auth          as auth,
      d.class_name    as class_name,
      d.coach_name    as coach_name,
      d.scheduled_for as scheduled_for,
      case
        when d.scheduled_for - p_now between interval '25 minutes' and interval '35 minutes'
          then 'imminent'
        else 'approaching'
      end             as phase
    from public.slot_declarations d
    join public.push_subscriptions s
      on s.fighter_id = d.fighter_id
     and s.failed_at is null
    where d.status = 'declared'
      and (
        d.scheduled_for - p_now between interval '85 minutes' and interval '95 minutes'
        or
        d.scheduled_for - p_now between interval '25 minutes' and interval '35 minutes'
      )
  ),
  claimed as (
    insert into public.slot_notifications (declaration_id, phase, endpoint)
    select due.declaration_id, due.phase, due.endpoint from due
    on conflict (declaration_id, phase, endpoint) do nothing
    returning declaration_id, phase, endpoint
  )
  select
    due.fighter_id, due.declaration_id, due.endpoint, due.p256dh, due.auth,
    due.class_name, due.coach_name, due.scheduled_for, due.phase
  from due
  join claimed c
    on c.declaration_id = due.declaration_id
   and c.phase          = due.phase
   and c.endpoint       = due.endpoint;
end $$;

revoke all on function public.due_slot_reminders(timestamptz) from anon;
revoke all on function public.due_slot_reminders(timestamptz) from public;
revoke all on function public.due_slot_reminders(timestamptz) from authenticated;
grant execute on function public.due_slot_reminders(timestamptz) to service_role;

create or replace function public.release_slot_notification(
  p_declaration_id uuid,
  p_phase          text,
  p_endpoint       text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'not authorised';
  end if;

  delete from public.slot_notifications
   where declaration_id = p_declaration_id
     and phase          = p_phase
     and endpoint       = p_endpoint;
end $$;

revoke all on function public.release_slot_notification(uuid, text, text) from anon;
revoke all on function public.release_slot_notification(uuid, text, text) from public;
revoke all on function public.release_slot_notification(uuid, text, text) from authenticated;
grant execute on function public.release_slot_notification(uuid, text, text) to service_role;
