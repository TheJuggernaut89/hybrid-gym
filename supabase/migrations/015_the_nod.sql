-- ── 015: THE NOD — who else is going ────────────────────────────────────────
--
-- Co-attendance with people you know is the only social mechanic with clean
-- causal evidence for PHYSICAL gym attendance (Babcock et al., J Public Econ
-- 2020). The effect is between close friends; between acquaintances it is
-- roughly nothing. A nickname on a declare row is a weaker proxy than the
-- evidence describes, and this is deliberately the cheapest test of whether
-- anyone cares before a friend graph gets built.
--
-- NOT a feed. Nothing is posted, nothing is ranked, nobody is followed. The
-- only thing revealed is that a member who opted in has declared a session
-- that you are currently looking at.

alter table public.fighters
  add column if not exists nickname text;

-- Default FALSE, and it stays false until the member says otherwise. Every
-- read below filters on it.
alter table public.fighters
  add column if not exists visible_to_gym boolean not null default false;

comment on column public.fighters.visible_to_gym is
  'Opt-in: may this member''s nickname be shown to others declaring the same session. Default false. Never inferred, never defaulted true on backfill.';

create index if not exists fighters_visible_idx
  on public.fighters (visible_to_gym) where visible_to_gym;


-- ── gym_mates: nicknames declared against sessions in a window ──────────────
--
-- ON THE COHORT FLOOR
--
-- src/lib/papan.ts already carries MIN_COHORT = 5, on the reasoning that below
-- that a cohort statistic identifies an individual. The same reasoning applies
-- here and is easy to miss, because the leak is not in what is shown — it is in
-- what is absent. If three members have opted in and the card says "Aina + 1
-- other", the fourth knows precisely who did not come.
--
-- So: nothing is returned for a session unless at least MIN_NOD opted-in
-- members have declared it, and the size of the opted-in population is never
-- exposed anywhere. Below the floor the caller gets no row at all, which reads
-- as "no information", not as "nobody is going".
create or replace function public.gym_mates(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  scheduled_for timestamptz,
  nickname      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  MIN_NOD constant int := 3;
begin
  -- A member, not the sender and not anon. This function reads across members,
  -- so unlike due_slot_reminders it requires a real end-user token.
  if auth.uid() is null then
    raise exception 'not authorised';
  end if;

  return query
  with visible as (
    select d.scheduled_for, f.nickname, d.fighter_id
    from public.slot_declarations d
    join public.fighters f on f.id = d.fighter_id
    where d.status = 'declared'
      and d.scheduled_for >= p_from
      and d.scheduled_for <= p_to
      and f.visible_to_gym
      and coalesce(btrim(f.nickname), '') <> ''
  ),
  big_enough as (
    select v.scheduled_for
    from visible v
    group by v.scheduled_for
    having count(*) >= MIN_NOD
  )
  select v.scheduled_for, v.nickname
  from visible v
  join big_enough b on b.scheduled_for = v.scheduled_for
  -- Never show the caller their own name back.
  where v.fighter_id <> auth.uid();
end $$;

revoke all on function public.gym_mates(timestamptz, timestamptz) from public;
revoke all on function public.gym_mates(timestamptz, timestamptz) from anon;
grant execute on function public.gym_mates(timestamptz, timestamptz) to authenticated;


-- ── NOT changing due_slot_reminders ─────────────────────────────────────────
--
-- Adding a nicknames column to that function's return type would require
-- DROP FUNCTION — `create or replace` cannot change a return type — and a drop
-- discards every grant on it, including the revoke/grant set that migration 008
-- exists as an entire migration to establish, and that 011 re-establishes. That
-- would be the fourth redefinition of that function in four migrations, against
-- a claim-inside-the-select CTE that has not yet run in production once.
--
-- The sender runs as service_role and bypasses RLS, so it does its own second
-- query for the nod instead. See supabase/functions/slot-reminders/index.ts.
-- No signature change, no lost grants.
