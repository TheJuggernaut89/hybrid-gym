-- ── 019: take TRUNCATE, TRIGGER and REFERENCES off every table ──────────────
--
-- Migration 016 did:
--
--     revoke insert, update, delete on public.<t> from authenticated;
--
-- and that was too narrow. Supabase's bootstrap grants ALL on every table in
-- `public` to `authenticated`, so verifying 016 showed SELECT — correct — next
-- to TRUNCATE, TRIGGER and REFERENCES, which were never revoked.
--
-- TRUNCATE IS NOT SUBJECT TO ROW LEVEL SECURITY.
--
-- RLS filters rows. TRUNCATE is a table-level operation and bypasses policies
-- entirely, so `owner reads training_sessions` does nothing to stop it. Any
-- member holding a valid JWT could have run
--
--     TRUNCATE public.training_sessions;
--
-- and destroyed every session record for every member of the gym. 016 was
-- written to stop someone inflating their own XP and left open the ability to
-- delete everyone's.
--
-- TRIGGER is an escalation path — it permits attaching a trigger to a table
-- whose functions run with the table owner's rights. REFERENCES is harmless but
-- has no business being granted to members either.
--
-- WHY THIS TOUCHES EVERY TABLE AND NOT JUST THE THREE FROM 016
-- The grant is a Supabase default, so it applies to fighters, workout_logs,
-- home_sessions, nutrition_logs, technique_progress and push_subscriptions
-- exactly as much. It predates this migration series entirely.
--
-- WHY IT ONLY REVOKES THESE THREE PRIVILEGES
-- INSERT/UPDATE/DELETE are deliberately left exactly as they are. Several
-- tables still need them from the client — push_subscriptions has to be
-- writable to subscribe and unsubscribe, workout_logs and home_sessions are
-- written directly by their server actions. Revoking broadly here would break
-- working paths to fix a different problem. TRUNCATE, TRIGGER and REFERENCES
-- are used by no application code anywhere, so removing them cannot break
-- anything.

do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'revoke truncate, trigger, references on public.%I from authenticated', t.tablename);
    execute format(
      'revoke truncate, trigger, references on public.%I from anon', t.tablename);
  end loop;
end $$;

-- Future tables inherit the same default, so close it at the source too.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from authenticated;
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon;

-- Verify — this should return ZERO rows:
--
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee in ('authenticated', 'anon')
--     and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
--   order by 1, 2, 3;
