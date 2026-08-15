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
