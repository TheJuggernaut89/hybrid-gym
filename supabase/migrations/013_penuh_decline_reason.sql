-- ── 013: `penuh` — the gym was full ─────────────────────────────────────────
--
-- The decline-reason log records why a declared session did not happen. Every
-- existing value is about the member: work ran over, traffic, unwell, tired,
-- family. There was no way to record the one cause the gym is responsible for.
--
-- WHY THIS NEEDS A MIGRATION AT ALL
--
-- The constraint lives inline in migration 002:
--
--     create table if not exists public.slot_declarations (
--       ...
--       decline_reason text check (decline_reason in ('kerja','penat','sakit','jam','family')),
--
-- 002 has already run, and `if not exists` means re-running it is a no-op. So
-- editing that line changes the file and nothing else — the live constraint
-- still rejects 'penuh', and the app would fail on write with a constraint
-- violation while the source looked correct.

do $$
declare
  v_name text;
begin
  -- Auto-named constraints are conventionally <table>_<column>_check, but do
  -- not trust the convention — look it up.
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'slot_declarations'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%decline_reason%'
  limit 1;

  if v_name is not null then
    execute format('alter table public.slot_declarations drop constraint %I', v_name);
  end if;
end $$;

alter table public.slot_declarations
  add constraint slot_declarations_decline_reason_check
  check (decline_reason in ('kerja', 'penat', 'sakit', 'jam', 'family', 'penuh'));

comment on column public.slot_declarations.decline_reason is
  'Why a declared session did not happen. All values but ''penuh'' describe the member; ''penuh'' means the gym turned them away, and consumers must not treat it as a lapse — see DECLINE_REASONS.gymSide in src/lib/slots.ts.';

-- What this is for. Run it weekly; four consecutive weeks of a slot above ~70%
-- of its room size is the evidence that would justify building capacity.
-- Note that it does NOT depend on 'penuh' — declarations have been recorded
-- since migration 002, so this history is already available:
--
--   select gym_slot_id, scheduled_for, count(*)
--   from public.slot_declarations
--   where status = 'declared' and scheduled_for > now() - interval '28 days'
--   group by 1, 2
--   order by 3 desc;
--
-- 'penuh' adds the other half: how often the room actually ran out, which a
-- declaration count cannot show because it cannot see walk-ins.
