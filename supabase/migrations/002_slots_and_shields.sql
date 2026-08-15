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
