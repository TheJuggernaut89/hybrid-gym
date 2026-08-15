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
