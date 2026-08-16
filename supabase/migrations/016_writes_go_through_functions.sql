-- ── 016: XP becomes unforgeable ─────────────────────────────────────────────
--
-- Four ways a member could write their own numbers, and closing only the first
-- would have been a gesture:
--
--  1. slot_declarations — `for insert with check (auth.uid() = fighter_id)`
--     (002:92) checks WHO, never WHAT. class_name, coach_name, duration_min and
--     scheduled_for were all member-authored free text.
--  2. shield_spends — same policy loop (002:84), so a member could INSERT rows
--     directly and skip the earned-shield check inside spend_shield entirely.
--     Shields are supposed to be minted by work.
--  3. training_sessions — `for all` (004:84) with the same own-row check, so a
--     hand-written row could carry any load_au it liked. load_au IS the XP.
--  4. log_session is granted to `authenticated` and, with a null
--     p_declaration_id, always inserts. duration_min ≤ 300 and rpe ≤ 10 bound a
--     single call to 3000 AU; nothing bounded the number of calls.
--
-- The shape of the fix: SELECT stays on the table, every write goes through a
-- SECURITY DEFINER function that re-checks auth.uid() and validates the values.
--
-- This is not about distrusting members. It is that XP, levels and the radar
-- are the app's only claim to mean anything, and a number anyone can type is
-- not a measurement.

-- ── declare_slot ────────────────────────────────────────────────────────────
-- For kind='class' the class name, coach and duration are taken FROM THE
-- TIMETABLE, not from the caller. That is the actual fix: previously a member
-- could declare "Muay Thai with Coach Faiz" at any instant they chose and it
-- would appear in a coach roster as fact.
create or replace function public.declare_slot(
  p_gym_slot_id   uuid,
  p_kind          text,
  p_class_name    text,
  p_scheduled_for timestamptz,
  p_duration_min  int
)
returns public.slot_declarations
language plpgsql
security definer
set search_path = public
as $$
declare
  d        public.slot_declarations;
  v_slot   public.gym_slots;
  v_name   text;
  v_coach  text;
  v_mins   int;
begin
  if auth.uid() is null then
    raise exception 'not authorised';
  end if;

  if p_kind not in ('class', 'floor', 'cardio') then
    raise exception 'unknown slot kind: %', p_kind;
  end if;

  if p_scheduled_for < now() - interval '1 hour' then
    raise exception 'cannot declare a session in the past';
  end if;
  if p_scheduled_for > now() + interval '28 days' then
    raise exception 'that is too far ahead to declare';
  end if;

  if p_kind = 'class' then
    select * into v_slot from public.gym_slots where id = p_gym_slot_id and active;
    if not found then
      raise exception 'no such class on the timetable';
    end if;
    -- Authoritative values, ignoring whatever the client sent.
    v_name  := v_slot.class_name;
    v_coach := v_slot.coach_name;
    v_mins  := v_slot.duration_min;
  else
    -- Floor and cardio have no timetable row, so the label is the caller's —
    -- but it is constrained to a short list and there is no coach to forge.
    if btrim(coalesce(p_class_name, '')) = '' then
      raise exception 'a session needs a name';
    end if;
    v_name  := left(btrim(p_class_name), 40);
    v_coach := null;
    v_mins  := least(greatest(coalesce(p_duration_min, 60), 10), 240);
  end if;

  insert into public.slot_declarations
    (fighter_id, gym_slot_id, kind, class_name, coach_name, scheduled_for,
     duration_min, status, downgrade_to, decline_reason, resolved_at)
  values
    (auth.uid(), case when p_kind = 'class' then p_gym_slot_id else null end,
     p_kind, v_name, v_coach, p_scheduled_for, v_mins, 'declared', null, null, null)
  on conflict (fighter_id, scheduled_for) do update
    set gym_slot_id    = excluded.gym_slot_id,
        kind           = excluded.kind,
        class_name     = excluded.class_name,
        coach_name     = excluded.coach_name,
        duration_min   = excluded.duration_min,
        status         = 'declared',
        downgrade_to   = null,
        decline_reason = null,
        resolved_at    = null
  returning * into d;

  return d;
end $$;

revoke all on function public.declare_slot(uuid, text, text, timestamptz, int) from public, anon;
grant execute on function public.declare_slot(uuid, text, text, timestamptz, int) to authenticated;


-- ── resolve_slot ────────────────────────────────────────────────────────────
-- Carries the status guard that src/app/actions/slots.ts added, so it holds
-- even if a future caller forgets it.
create or replace function public.resolve_slot(
  p_declaration_id uuid,
  p_status         text,
  p_downgrade_to   text default null,
  p_decline_reason text default null
)
returns public.slot_declarations
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.slot_declarations;
begin
  if auth.uid() is null then
    raise exception 'not authorised';
  end if;

  if p_status not in ('honoured', 'downgraded', 'declined') then
    raise exception 'cannot resolve to %', p_status;
  end if;

  update public.slot_declarations
     set status         = p_status,
         downgrade_to   = case when p_status = 'downgraded' then p_downgrade_to else null end,
         decline_reason = case when p_status = 'declined'   then p_decline_reason else null end,
         resolved_at    = now()
   where id = p_declaration_id
     and fighter_id = auth.uid()
     and status = 'declared'
  returning * into d;

  -- No row: already resolved, or not theirs. Both are "nothing to do" — the
  -- caller distinguishes them no further, deliberately.
  return d;
end $$;

revoke all on function public.resolve_slot(uuid, text, text, text) from public, anon;
grant execute on function public.resolve_slot(uuid, text, text, text) to authenticated;


-- ── log_session gains a daily ceiling ───────────────────────────────────────
-- The per-call bounds were already there; the missing one was per day. Twelve
-- sessions inside one gym day is far beyond any real training day and well
-- inside the range where a member is obviously fabricating.
create or replace function public.log_session(
  p_fighter_id    uuid,
  p_session_type  text,
  p_stat          text,
  p_duration_min  int,
  p_rpe           int,
  p_label         text default null,
  p_declaration_id uuid default null
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_load       int;
  v_session_id uuid;
  v_today      int;
  v_fighter    public.fighters;
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised';
  end if;

  if p_rpe < 1 or p_rpe > 10 then
    raise exception 'rpe out of range';
  end if;
  if p_duration_min <= 0 or p_duration_min > 300 then
    raise exception 'duration out of range';
  end if;

  select count(*) into v_today
  from public.training_sessions
  where fighter_id = p_fighter_id
    and (created_at at time zone 'Asia/Kuala_Lumpur')::date
        = (now() at time zone 'Asia/Kuala_Lumpur')::date;

  if v_today >= 12 then
    raise exception 'that is a lot of sessions for one day — log the rest tomorrow';
  end if;

  v_load := p_duration_min * p_rpe;

  insert into public.training_sessions
    (fighter_id, session_type, stat, duration_min, rpe, load_au, label, declaration_id)
  values
    (p_fighter_id, p_session_type, p_stat, p_duration_min, p_rpe, v_load, p_label, p_declaration_id)
  on conflict (declaration_id) where declaration_id is not null do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select * into v_fighter from public.fighters where id = p_fighter_id;
    return v_fighter;
  end if;

  select * into v_fighter
  from public.award_xp(p_fighter_id, p_stat, v_load, false);

  return v_fighter;
end $$;

revoke all on function public.log_session(uuid, text, text, int, int, text, uuid) from public;
grant execute on function public.log_session(uuid, text, text, int, int, text, uuid) to authenticated;


-- ── close the four doors ────────────────────────────────────────────────────
-- SELECT stays: every screen reads the member's own rows directly, and reading
-- your own data was never the problem.
do $$
declare t text;
begin
  foreach t in array array['slot_declarations', 'shield_spends', 'training_sessions'] loop
    execute format('drop policy if exists "owner writes %1$s"   on public.%1$I', t);
    execute format('drop policy if exists "owner updates %1$s"  on public.%1$I', t);
    execute format('drop policy if exists "owner deletes %1$s"  on public.%1$I', t);
    execute format('drop policy if exists own_%1$s              on public.%1$I', t);

    -- Re-assert read-only ownership.
    execute format('drop policy if exists "owner reads %1$s" on public.%1$I', t);
    execute format(
      'create policy "owner reads %1$s" on public.%1$I for select using (auth.uid() = fighter_id)', t);

    -- The SECURITY DEFINER functions above run as the owner and are unaffected.
    execute format('revoke insert, update, delete on public.%1$I from authenticated', t);
    execute format('revoke all on public.%1$I from anon', t);
  end loop;
end $$;

-- Verify after applying — expect SELECT only for `authenticated`:
--   select table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee = 'authenticated'
--     and table_name in ('slot_declarations','shield_spends','training_sessions')
--   order by 1, 2;


-- ── the fifth door, which is wider than the other four ──────────────────────
--
-- award_xp is granted directly to `authenticated` and takes the amount as an
-- argument. So none of the above matters much on its own: a member holding the
-- anon key (it ships inlined in the client bundle) and their own JWT can
--
--   POST /rest/v1/rpc/award_xp {"p_fighter_id": "<self>", "p_stat": "craft",
--                               "p_amount": 999999999}
--
-- and set their own level. It is granted because two server actions —
-- logWorkout and logHomeSession — call it after inserting their row, computing
-- the amount in TypeScript (xpFromOcr, xpFromHome).
--
-- The clean fix is to move those two paths behind their own SECURITY DEFINER
-- functions so award_xp can be revoked from members entirely. That means
-- reimplementing both XP curves in PL/pgSQL, where they would immediately be
-- at risk of drifting from the TypeScript originals — a correctness problem
-- traded for a security one.
--
-- So this bounds it instead. A single award cannot exceed the ceiling a real
-- session can produce (300 min x RPE 10), and a day cannot exceed what twelve
-- such sessions would. That turns "set your level to anything" into "inflate
-- it at roughly the rate of a person who trains implausibly hard", which is
-- worth the trade until the two callers are moved.
create or replace function public.award_xp(
  p_fighter_id uuid,
  p_stat       text,
  p_amount     int,
  p_rest_day   boolean default false
)
returns public.fighters
language plpgsql
security definer
set search_path = public
as $$
declare
  f            public.fighters;
  total_sess   int;
  spent        int;
  available    int;
  v_amount     int;
  v_today_xp   int;
  today        date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  MAX_PER_CALL constant int := 3000;    -- 300 min x RPE 10
  MAX_PER_DAY  constant int := 36000;   -- twelve of those
begin
  if auth.uid() is null or auth.uid() <> p_fighter_id then
    raise exception 'not authorised to award xp for this fighter';
  end if;

  if p_stat not in ('craft', 'engine', 'strength', 'power', 'recovery') then
    raise exception 'unknown stat: %', p_stat;
  end if;

  v_amount := least(greatest(coalesce(p_amount, 0), 0), MAX_PER_CALL);

  select * into f from public.fighters where id = p_fighter_id for update;
  if not found then
    raise exception 'fighter not found';
  end if;

  -- Everything awarded today, reconstructed from the tables that record it.
  select
    coalesce((select sum(load_au) from public.training_sessions
               where fighter_id = p_fighter_id
                 and (created_at at time zone 'Asia/Kuala_Lumpur')::date = today), 0)
  + coalesce((select sum(xp_awarded) from public.workout_logs
               where fighter_id = p_fighter_id
                 and (created_at at time zone 'Asia/Kuala_Lumpur')::date = today), 0)
  + coalesce((select sum(xp_awarded) from public.home_sessions
               where fighter_id = p_fighter_id
                 and (created_at at time zone 'Asia/Kuala_Lumpur')::date = today), 0)
    into v_today_xp;

  if v_today_xp >= MAX_PER_DAY then
    raise exception 'daily xp ceiling reached';
  end if;
  v_amount := least(v_amount, MAX_PER_DAY - v_today_xp);

  select
    (select count(*) from public.workout_logs      where fighter_id = p_fighter_id)
  + (select count(*) from public.home_sessions     where fighter_id = p_fighter_id)
  + (select count(*) from public.training_sessions where fighter_id = p_fighter_id)
    into total_sess;
  select count(*) into spent from public.shield_spends where fighter_id = p_fighter_id;
  available := least(3, greatest(0, floor(total_sess / 5) - spent));

  update public.fighters
     set total_xp         = total_xp + v_amount,
         craft_xp         = craft_xp    + case when p_stat = 'craft'    then v_amount else 0 end,
         engine_xp        = engine_xp   + case when p_stat = 'engine'   then v_amount else 0 end,
         strength_xp      = strength_xp + case when p_stat = 'strength' then v_amount else 0 end,
         power_xp         = power_xp    + case when p_stat = 'power'    then v_amount else 0 end,
         recovery_xp      = recovery_xp + case when p_stat = 'recovery' then v_amount else 0 end,
         level            = public.level_for_xp(total_xp + v_amount),
         rest_shields     = available,
         last_active_date = today,
         updated_at       = now()
   where id = p_fighter_id
   returning * into f;

  return f;
end $$;

revoke all on function public.award_xp(uuid, text, int, boolean) from public, anon;
grant execute on function public.award_xp(uuid, text, int, boolean) to authenticated;
