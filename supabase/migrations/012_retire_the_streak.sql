-- ── 012: retire the streak, and make a shield protect something visible ─────
--
-- WHY THE STREAK GOES
--
-- `award_xp` decided what "today" was with:
--
--     today := (now() at time zone 'utc')::date;
--
-- and only advanced the counter on `gap_days = 1`. This gym is UTC+8. A 19:30
-- class is 11:30 UTC — Monday. The 07:00 class the next morning is 23:00 UTC —
-- also Monday. gap_days = 0, the streak does not move. Anything ≥ 2 resets it
-- to 1.
--
-- So a member training four times a week sat at a streak of 1-3, which the
-- DISCIPLINE radar axis rendered as 7-19 out of 100. The chart told the gym's
-- most consistent members they were undisciplined, and STREAK_SEVEN — 700 XP,
-- the largest reward in the seed set — was close to unwinnable for anyone who
-- trains mornings.
--
-- It was also incoherent with the safety model: seven consecutive training days
-- is exactly the pattern computeLoad flags as `monotonous` and vetoes every
-- commercial recommendation for. The app paid its biggest bounty for the thing
-- it exists to prevent.
--
-- Adherence is TEMPO's job now — a rolling rate, on /now, where the member
-- actually looks.
--
-- The `streak_count` column stays. Dropping it would break `select *` into the
-- fighters rowtype that every one of these functions returns; it simply stops
-- being written and nothing reads it.

-- ── award_xp v5 ─────────────────────────────────────────────────────────────
-- v4 minus the streak. The FOUR-ARGUMENT SIGNATURE IS LOAD-BEARING: migration
-- 010's log_session calls award_xp(uuid, text, int, boolean). Changing it here
-- would leave that call resolving to a function that no longer exists.
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
  total_sess int;
  spent      int;
  available  int;
  -- Gym time, not UTC. The old UTC cast is the bug this migration exists for,
  -- and last_active_date is still shown to members.
  today      date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
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

  -- Shields still mint from work: every fifth session, capped at three.
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
         rest_shields     = available,
         last_active_date = today,
         updated_at       = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end $$;

revoke all on function public.award_xp(uuid, text, int, boolean) from public;
grant execute on function public.award_xp(uuid, text, int, boolean) to authenticated;


-- ── the bounty ──────────────────────────────────────────────────────────────
-- STREAK_SEVEN is a seeded ROW, read live with .eq('active', true). Removing
-- the TypeScript metric alone would leave it on screen, permanently at 0%,
-- because computeBountyProgress resolves an unknown metric to 0.
update public.bounties set active = false where code = 'STREAK_SEVEN';

-- Replace it rather than leaving a hole: same 700 XP, but on session load,
-- which every modality can earn — the mats, the floor, a machine.
insert into public.bounties (code, title, description, target_metric, target_value, xp_reward)
values ('WEEKLY_LOAD', 'TOTAL TONNAGE',
        'Bank 2000 AU of session load this week — mats, floor or machines.',
        'load', 2000, 700)
on conflict (code) do update
  set active = true,
      title = excluded.title,
      description = excluded.description,
      target_metric = excluded.target_metric,
      target_value = excluded.target_value,
      xp_reward = excluded.xp_reward;

-- FLOOR PRESENCE counts `sessions`, which computeBountyProgress now sums from
-- workout_logs AND training_sessions, so class attendance finally counts toward
-- it. Copy corrected — it said "scanned", which excluded the mats.
update public.bounties
   set description = 'Complete 4 sessions — class, floor or machine.'
 where code = 'WEEKLY_FLOOR';


-- ── log_rest_day is withdrawn ───────────────────────────────────────────────
-- It awarded 40 recovery XP and wrote no row anywhere, so it was the one
-- component of total_xp that could not be reconstructed from any table — which
-- is what made migration 010's drift report ambiguous. Its only caller was a
-- component that /hud imported and never rendered, so no member could reach it.
revoke all on function public.log_rest_day(uuid) from public;
revoke all on function public.log_rest_day(uuid) from anon;
revoke all on function public.log_rest_day(uuid) from authenticated;


-- ── spend_shield v2: a shield covers a WEEK, and cannot be burned for nothing ─
--
-- Three defects in v1:
--
--   1. `p_covers > today` refused any future date, while the UI text promised
--      it "protects a week you already know you will miss". You could not
--      shield Raya until Raya had already cost you.
--   2. `today` was computed in UTC, so the window moved eight hours.
--   3. The shield was decremented whether or not the INSERT did anything. A
--      second spend on an already-covered week silently cost a shield and
--      bought nothing — the same shape as the log_session bug in 010.
--
-- covers_date is now normalised to the Monday of the week it names, so the
-- existing unique index on (fighter_id, covers_date) prevents double-covering
-- a week without needing a new constraint.
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
  f           public.fighters;
  total_sess  int;
  spent       int;
  available   int;
  today       date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_week      date := date_trunc('week', p_covers)::date;
  this_week   date := date_trunc('week', (now() at time zone 'Asia/Kuala_Lumpur')::date)::date;
  v_inserted  uuid;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'a shield needs a stated reason';
  end if;

  -- Forward-looking by design: the whole point is to protect a week you can
  -- already see coming. Four weeks out is the TEMPO window itself — beyond
  -- that the shield would expire before it ever discounted anything.
  if v_week < this_week then
    raise exception 'that week has already gone';
  end if;
  if v_week > this_week + 28 then
    raise exception 'that week is too far ahead to protect';
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
  values (p_fighter_id, btrim(p_reason), v_week)
  on conflict (fighter_id, covers_date) do nothing
  returning id into v_inserted;

  -- Already covered. Hand the fighter back untouched rather than charging for
  -- a week that is already protected.
  if v_inserted is null then
    select * into f from public.fighters where id = p_fighter_id;
    return f;
  end if;

  update public.fighters
     set rest_shields = greatest(0, available - 1),
         updated_at   = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end $$;

revoke all on function public.spend_shield(uuid, text, date) from public;
grant execute on function public.spend_shield(uuid, text, date) to authenticated;

-- Normalise the spends already on file to their Monday, so the new unique
-- semantics and computeTempo's week expansion agree with history.
update public.shield_spends
   set covers_date = date_trunc('week', covers_date)::date
 where covers_date <> date_trunc('week', covers_date)::date
   -- Skip any row whose Monday is already taken; those are genuine duplicates
   -- under the new semantics and are left for the report below.
   and not exists (
     select 1 from public.shield_spends s2
      where s2.fighter_id = shield_spends.fighter_id
        and s2.covers_date = date_trunc('week', shield_spends.covers_date)::date
   );

-- Spends that could not be normalised because the week was already covered.
select fighter_id, covers_date, reason
from public.shield_spends
where covers_date <> date_trunc('week', covers_date)::date;
