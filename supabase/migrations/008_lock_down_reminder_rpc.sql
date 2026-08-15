-- ============================================================================
-- 008 — LOCK DOWN due_slot_reminders()
--
-- SECURITY FIX. Migration 006 did:
--
--     revoke all on function public.due_slot_reminders(timestamptz) from public;
--     revoke all on function public.due_slot_reminders(timestamptz) from authenticated;
--
-- and stopped one role short. Supabase's bootstrap default privileges grant
-- EXECUTE on new functions in `public` to anon, authenticated AND service_role
-- as explicit grants — revoking from the PUBLIC pseudo-role does not remove an
-- explicit grant to `anon`.
--
-- The function is SECURITY DEFINER with no internal auth.uid() check (unlike
-- log_session, which gates on the caller), and it returns endpoint, p256dh and
-- auth for EVERY member with a subscription. The anon key ships inlined in the
-- client bundle, so anyone who loads the site could call
--
--     POST /rest/v1/rpc/due_slot_reminders
--
-- and walk away with the push credentials for the whole gym — enough to send
-- forged notifications to real members' devices.
--
-- This migration removes anon's access and makes service_role's access
-- explicit rather than inherited.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

revoke all on function public.due_slot_reminders(timestamptz) from anon;
revoke all on function public.due_slot_reminders(timestamptz) from public;
revoke all on function public.due_slot_reminders(timestamptz) from authenticated;

-- The scheduled sender is the only legitimate caller.
grant execute on function public.due_slot_reminders(timestamptz) to service_role;

-- Belt and braces: even if a future migration re-grants execute, the function
-- itself now refuses anyone who is not running as the service role. A
-- SECURITY DEFINER function that reads across every member should not depend
-- on GRANT hygiene alone.
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
stable
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
    and (
      d.scheduled_for - p_now between interval '85 minutes' and interval '95 minutes'
      or
      d.scheduled_for - p_now between interval '25 minutes' and interval '35 minutes'
    );
end $$;

revoke all on function public.due_slot_reminders(timestamptz) from anon;
revoke all on function public.due_slot_reminders(timestamptz) from public;
revoke all on function public.due_slot_reminders(timestamptz) from authenticated;
grant execute on function public.due_slot_reminders(timestamptz) to service_role;

-- Verify after applying:
--   select grantee, privilege_type from information_schema.role_routine_grants
--   where routine_name = 'due_slot_reminders';
-- Expect service_role only.
