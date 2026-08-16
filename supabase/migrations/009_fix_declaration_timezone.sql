-- ── 009: repair declarations written by the UTC timezone bug ────────────────
--
-- nextOccurrence() built a slot's instant with setHours()/getDay(), which read
-- whatever zone the process ran in. Netlify runs UTC, so the Monday 19:30 class
-- was stored as 19:30 UTC — 03:30 Tuesday in Damansara. Members saw TUE 03:30
-- in the picker, and the reminder cron fired their T-90 push at 2am.
--
-- The code fix (src/lib/slots.ts) stops new rows being written wrong. It does
-- nothing for rows already in the table. This does that.
--
-- WHY THIS IS NOT A BLANKET `- interval '8 hours'`
-- The same Supabase project is used from a Malaysian dev machine, where the old
-- code produced the CORRECT instant. A blanket shift would break exactly the
-- rows that were right. So each row is checked against gym_slots — the source
-- of truth — and moved only when it currently disagrees with the timetable AND
-- agrees after the shift. That makes this idempotent: run it twice and the
-- second run matches nothing.
--
-- RUNBOOK — pause the sender first, or the cutover itself can fire a push:
--   select cron.unschedule('slot-reminders');
--   <run this migration>
--   <re-create the job per DEPLOY.md step 6>

begin;

-- Only live rows. A resolved declaration is settled history and TEMPO reads
-- training_sessions.created_at, not scheduled_for, so rewriting it would edit
-- the log to fix nothing.
with repaired as (
  update public.slot_declarations d
     set scheduled_for = d.scheduled_for - interval '8 hours'
    from public.gym_slots g
   where d.gym_slot_id = g.id
     and d.status = 'declared'
     -- currently disagrees with the timetable, in gym time…
     and (
       (d.scheduled_for at time zone 'Asia/Kuala_Lumpur')::time <> g.start_time
       or extract(dow from (d.scheduled_for at time zone 'Asia/Kuala_Lumpur')) <> g.day_of_week
     )
     -- …and agrees once shifted back.
     and ((d.scheduled_for - interval '8 hours') at time zone 'Asia/Kuala_Lumpur')::time = g.start_time
     and extract(dow from ((d.scheduled_for - interval '8 hours') at time zone 'Asia/Kuala_Lumpur')) = g.day_of_week
  returning d.id
)
select count(*) as declarations_repaired from repaired;

-- Anything still disagreeing is NOT explained by this bug — a hand-written row,
-- a timetable edited after the declaration, or a free-form declaration with no
-- gym_slot_id. Surfaced rather than silently coerced.
select
  d.id,
  d.class_name,
  d.scheduled_for,
  (d.scheduled_for at time zone 'Asia/Kuala_Lumpur') as reads_at_gym,
  g.start_time as timetable_says
from public.slot_declarations d
left join public.gym_slots g on g.id = d.gym_slot_id
where d.status = 'declared'
  and (
    g.id is null
    or (d.scheduled_for at time zone 'Asia/Kuala_Lumpur')::time <> g.start_time
  );

commit;
