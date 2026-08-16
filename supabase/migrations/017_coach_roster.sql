-- ── 017: the coach roster ───────────────────────────────────────────────────
--
-- Every query in the app is `.eq('fighter_id', user.id)`. Nothing reaches a
-- human. At ~40 members, a coach seeing "42 days, zero sessions" and sending
-- four WhatsApp messages on a Tuesday is a higher-bandwidth intervention than
-- any notification this codebase can generate — and it is the only mechanism
-- built so far that reaches someone who has stopped opening the app at all.
--
-- THREE THINGS THIS DELIBERATELY DOES NOT DO
--
-- 1. It does not read `visible_to_gym`. That flag is consent for MEMBER-TO-
--    MEMBER visibility (THE NOD) and defaults false; gating the roster on it
--    would leave the coach seeing only the members who are already engaged
--    enough to opt in — precisely inverting what the roster is for. A coach
--    seeing attendance at their own gym is an operational function of the
--    business, not a social feature, and it is scoped to staff.
--
-- 2. It does not return decline reasons. `kerja`, `penat`, `sakit`, `jam` were
--    collected under an explicit promise — "one tap says why, no lecture
--    attached to the answer". Handing them to a coach changes that deal after
--    the fact. Recency of attendance is enough to prompt a conversation, and
--    the conversation is where the reason belongs.
--
-- 3. It has no nudge button, and will not get one without a norm to go with
--    it. PRODUCT-DIRECTION.md is blunt about this: "The coach console is a
--    surveillance instrument pointed at members. If a coach uses it to publicly
--    shame someone in the group chat, community trust detonates in a week."

alter table public.fighters
  add column if not exists role text not null default 'member'
  check (role in ('member', 'coach'));

comment on column public.fighters.role is
  'Staff flag. Set by hand in the SQL editor — there is deliberately no in-app promotion path.';

create index if not exists fighters_role_idx on public.fighters (role) where role = 'coach';


-- ── coach_roster ────────────────────────────────────────────────────────────
create or replace function public.coach_roster()
returns table (
  fighter_id       uuid,
  name             text,
  days_since_last  int,
  sessions_28d     int,
  member_since     date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorised';
  end if;

  if not exists (
    select 1 from public.fighters
    where id = auth.uid() and role = 'coach'
  ) then
    raise exception 'not authorised';
  end if;

  return query
  with activity as (
    -- Every modality, not just training_sessions. A member logging only via the
    -- machine scanner would otherwise read as 'never trained' and get chased.
    select fighter_id, created_at from public.training_sessions
    union all
    select fighter_id, created_at from public.workout_logs
    union all
    select fighter_id, created_at from public.home_sessions
  )
  select
    f.id,
    f.name,
    case
      when max(a.created_at) is null then null
      else extract(day from now() - max(a.created_at))::int
    end,
    count(*) filter (where a.created_at >= now() - interval '28 days')::int,
    f.created_at::date
  from public.fighters f
  left join activity a on a.fighter_id = f.id
  where f.onboarded
  group by f.id, f.name, f.created_at
  -- Longest absence first: the list is a work queue, not a leaderboard.
  order by max(a.created_at) asc nulls first;
end $$;

revoke all on function public.coach_roster() from public, anon;
grant execute on function public.coach_roster() to authenticated;


-- ── promoting a coach ───────────────────────────────────────────────────────
--   update public.fighters set role = 'coach' where id = '<uuid>';
--
-- And the same list without any app at all, for whoever prefers the SQL editor
-- — the roster screen adds convenience, not information:
--
--   select f.name,
--          extract(day from now() - max(a.created_at))::int as days_since_last,
--          count(*) filter (where a.created_at >= now() - interval '28 days') as sessions_28d
--   from public.fighters f
--   left join (
--     select fighter_id, created_at from public.training_sessions
--     union all select fighter_id, created_at from public.workout_logs
--     union all select fighter_id, created_at from public.home_sessions
--   ) a on a.fighter_id = f.id
--   where f.onboarded
--   group by f.id, f.name
--   order by max(a.created_at) asc nulls first;
