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
