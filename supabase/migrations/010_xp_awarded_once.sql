-- ── 010: pay for a session once ─────────────────────────────────────────────
--
-- log_session() deduped the training_sessions INSERT and then called award_xp()
-- regardless:
--
--     insert into public.training_sessions (...)
--     on conflict (declaration_id) where declaration_id is not null do nothing;
--
--     select * into v_fighter
--     from public.award_xp(p_fighter_id, p_stat, v_load, false);   -- always ran
--
-- So the unique index did its job — one session row per declaration — while the
-- member was paid again every time resolveSlot() replayed. The guard protected
-- the log and not the ledger.
--
-- Load, TEMPO and the macro targets all read training_sessions, so they were
-- never wrong. Only total_xp, the per-stat XP and therefore `level` inflated.

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
  on conflict (declaration_id) where declaration_id is not null do nothing
  returning id into v_session_id;

  -- No id came back, so the insert hit the unique index: this declaration has
  -- already been logged and already been paid for. Return the fighter as-is.
  --
  -- A free-form session (p_declaration_id is null) cannot take this branch —
  -- the partial index does not cover it, so the insert always returns an id.
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


-- ── drift report — READ THIS BEFORE "CORRECTING" ANYTHING ───────────────────
--
-- The build order called for recomputing total_xp from the session tables.
-- That cannot be done correctly, and running it would destroy real XP:
--
--   log_rest_day() awards 40 recovery XP and WRITES NO ROW ANYWHERE. There is
--   no rest_days table. Rest-day XP is therefore unrecoverable from the schema.
--
-- So the residual below is (rest-day XP) + (double-awards) mixed together, with
-- no way to separate them. A blind UPDATE would zero out every rest day every
-- member has ever logged in order to claw back a duplicate worth a few hundred.
--
-- Run this to see the size of the problem. Do not act on it without deciding
-- what to do about rest days first.
select
  f.id,
  f.name,
  f.total_xp                                        as stored_xp,
  coalesce(ts.load, 0)
    + coalesce(wl.xp, 0)
    + coalesce(hs.xp, 0)                            as recoverable_xp,
  f.total_xp
    - (coalesce(ts.load, 0) + coalesce(wl.xp, 0) + coalesce(hs.xp, 0))
                                                    as residual,
  -- Whole multiples of 40 are consistent with rest days alone; a residual that
  -- is not a multiple of 40 contains double-awarded session load.
  ((f.total_xp - (coalesce(ts.load, 0) + coalesce(wl.xp, 0) + coalesce(hs.xp, 0))) % 40)
                                                    as not_explained_by_rest_days
from public.fighters f
left join (
  select fighter_id, sum(load_au) as load from public.training_sessions group by 1
) ts on ts.fighter_id = f.id
left join (
  select fighter_id, sum(xp_awarded) as xp from public.workout_logs group by 1
) wl on wl.fighter_id = f.id
left join (
  select fighter_id, sum(xp_awarded) as xp from public.home_sessions group by 1
) hs on hs.fighter_id = f.id
order by residual desc;
