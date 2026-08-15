-- ═══════════════════════════════════════════════════════════════════════════
--  003 — THE COACHING LADDER
--  Per-technique feedback state. Additive and idempotent.
--
--  Feedback fades as competence rises: ACQUIRE -> BANDWIDTH -> SUMMARY ->
--  SILENT_PROBE -> MASTERED. A technique is only mastered once it holds up with
--  the coach silent. State transitions live in src/lib/ladder.ts.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.technique_progress (
  id            uuid primary key default gen_random_uuid(),
  fighter_id    uuid not null references public.fighters(id) on delete cascade,
  drill_id      text not null,
  stage         text not null default 'ACQUIRE'
                check (stage in ('ACQUIRE','BANDWIDTH','SUMMARY','SILENT_PROBE','MASTERED')),
  clean_run     int  not null default 0,
  probes_passed int  not null default 0,
  probes_failed int  not null default 0,
  best_score    numeric not null default 0,
  last_score    numeric,
  sessions      int  not null default 0,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (fighter_id, drill_id)
);

create index if not exists technique_progress_fighter_idx
  on public.technique_progress (fighter_id);

alter table public.technique_progress enable row level security;

drop policy if exists "owner reads technique_progress"   on public.technique_progress;
drop policy if exists "owner writes technique_progress"  on public.technique_progress;
drop policy if exists "owner updates technique_progress" on public.technique_progress;

create policy "owner reads technique_progress" on public.technique_progress
  for select using (auth.uid() = fighter_id);
create policy "owner writes technique_progress" on public.technique_progress
  for insert with check (auth.uid() = fighter_id);
create policy "owner updates technique_progress" on public.technique_progress
  for update using (auth.uid() = fighter_id) with check (auth.uid() = fighter_id);

-- Record which ladder stage a session was performed under. Without this the
-- session log cannot distinguish "82% with cues" from "82% during a probe",
-- and those are very different results.
alter table public.home_sessions
  add column if not exists ladder_stage text
  check (ladder_stage in ('ACQUIRE','BANDWIDTH','SUMMARY','SILENT_PROBE','MASTERED'));
