-- ── 014: the floor and the machines get a slot too ──────────────────────────
--
-- THE SLOT is the only mechanic in the app with a plausible causal path to
-- attendance: declare intent, get a push at T-90 and T-30, log or say why not.
-- It was available exclusively for timetabled classes.
--
-- Most of this gym is an open weights floor and a row of cardio machines. A
-- member who lifts three times a week and has never taken a class opened /now
-- and found eight Muay Thai and BJJ rows and nothing to press. They could log
-- work after the fact via /train, but they could never DECLARE — so they never
-- entered the reminder loop, and because push permission is only ever requested
-- on the declare path, the app had no outbound channel to them at all.
--
-- Two schema changes.

-- 1. A floor session has no coach. The column was NOT NULL because every
--    declaration used to come from the timetable.
alter table public.slot_declarations
  alter column coach_name drop not null;

-- 2. What kind of session this is.
--
--    `gym_slot_id is null` already implies "not from the timetable", but it is
--    an inference, and one thing already depends on getting this right:
--    countClassesThisWeek feeds classesUsed into the paid tier-upgrade offer.
--    Left inferred, a lifter honouring three floor declarations would be told
--    he had used up the class allowance on his membership tier and shown an
--    upsell. Latent only because class_quota is null for everyone today.
alter table public.slot_declarations
  add column if not exists kind text not null default 'class'
  check (kind in ('class', 'floor', 'cardio'));

comment on column public.slot_declarations.kind is
  'class = from gym_slots. floor = open weights. cardio = machines. Only ''class'' counts against a tier''s class allowance.';

-- Everything that exists today came from the timetable.
update public.slot_declarations set kind = 'class' where kind is null;

create index if not exists slot_declarations_kind_idx
  on public.slot_declarations (fighter_id, kind, scheduled_for desc);

-- Note on the unique index (fighter_id, scheduled_for) from 002: it is kept.
-- A member cannot be on the mats and under a barbell at the same instant, so
-- one declaration per start time is correct. What was wrong was that the upsert
-- replaced the old row SILENTLY — declareSlot now reads the existing row first
-- and names what it replaced.

-- Note on migration 009's audit query: it reports `declared` rows whose
-- gym_slot_id is null as unexplained, which was right when every declaration
-- came from the timetable. Once floor declarations exist that report needs
-- `and kind = 'class'` added, or it will list every floor session forever.
