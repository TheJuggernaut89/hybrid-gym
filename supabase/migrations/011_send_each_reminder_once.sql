-- ── 011: send each reminder exactly once ────────────────────────────────────
--
-- The match bands are ten minutes wide:
--
--     d.scheduled_for - p_now between interval '85 minutes' and interval '95 minutes'
--     d.scheduled_for - p_now between interval '25 minutes' and interval '35 minutes'
--
-- and the sender runs on `*/5`. Every declaration therefore matches TWO OR
-- THREE consecutive cron ticks. The notification carries
-- `tag: slot-<declaration_id>`, so the approaching repeats replaced each other
-- quietly — but the imminent phase sets `renotify: true`, which is an explicit
-- instruction to alert again. T-30 buzzed the member two or three times.
--
-- Widening the tag or narrowing the band would both be guesses. The bands exist
-- to tolerate a late or skipped cron tick, and narrowing them to 5 minutes
-- trades duplicate sends for silent misses. The actual requirement is
-- idempotency, so that is what this adds.
--
-- Notification permission is one-shot: once a member turns the channel off,
-- there is no way to ask again. Three buzzes for one class is how that happens.

create table if not exists public.slot_notifications (
  declaration_id uuid        not null references public.slot_declarations(id) on delete cascade,
  phase          text        not null check (phase in ('approaching', 'imminent')),
  -- Per endpoint, not per member: a member with a phone and a laptop should get
  -- the reminder on both, once each.
  endpoint       text        not null,
  sent_at        timestamptz not null default now(),
  primary key (declaration_id, phase, endpoint)
);

-- No policies. This table is written and read only by the sender running as
-- service_role, which bypasses RLS; enabling it with no policy means a leaked
-- anon or authenticated key reads nothing.
alter table public.slot_notifications enable row level security;

revoke all on table public.slot_notifications from anon, authenticated;


-- ── the sender's one call ───────────────────────────────────────────────────
--
-- Claiming happens inside the same statement that selects, so two overlapping
-- cron runs cannot both take the same (declaration, phase, endpoint): the
-- second one's INSERT hits the primary key, is swallowed by DO NOTHING, and
-- that row simply does not come back to it.
--
-- This makes the function VOLATILE — reading it has a side effect, which is the
-- point. It also makes delivery AT MOST once rather than at least once. That is
-- the correct trade here: a missed reminder costs one nudge, while a duplicate
-- costs the channel permanently. release_slot_notification() below hands the
-- claim back when a send fails for a reason worth retrying.
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
  -- auth.uid() is null for service_role (no end-user JWT) and non-null for any
  -- request carrying a user token. A logged-in member must never reach this.
  if auth.uid() is not null then
    raise exception 'not authorised';
  end if;

  return query
  with due as (
    select
      d.fighter_id                        as fighter_id,
      d.id                                as declaration_id,
      s.endpoint                          as endpoint,
      s.p256dh                            as p256dh,
      s.auth                              as auth,
      d.class_name                        as class_name,
      d.coach_name                        as coach_name,
      d.scheduled_for                     as scheduled_for,
      case
        when d.scheduled_for - p_now between interval '25 minutes' and interval '35 minutes'
          then 'imminent'
        else 'approaching'
      end                                 as phase
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
    due.fighter_id,
    due.declaration_id,
    due.endpoint,
    due.p256dh,
    due.auth,
    due.class_name,
    due.coach_name,
    due.scheduled_for,
    due.phase
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


-- ── hand a claim back ───────────────────────────────────────────────────────
--
-- For sends that failed in a way worth retrying — a timeout, a 500 from the
-- push service. NOT for 404/410, where the subscription is gone and the sender
-- deletes it outright.
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


-- Housekeeping: the rows are only interesting until the class has been and
-- gone. ON DELETE CASCADE clears most of them with the declaration; this
-- catches the rest.
delete from public.slot_notifications
 where sent_at < now() - interval '30 days';
