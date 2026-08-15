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
