-- ── 018: capacity ───────────────────────────────────────────────────────────
--
-- READ THIS BEFORE SETTING A CAPACITY.
--
-- This counts DECLARATIONS, and a declaration is not a person in the room.
-- Members who never open the app still fill the mat. So a slot showing "12 of
-- 20" may be physically full, and the number will tell somebody there is space
-- when there is not. Until there is a check-in at the door, capacity here is a
-- soft signal for the app, never an authority for the room.
--
-- That is why `gym_slots.capacity` is NULLABLE and null by default. With no
-- capacity set, everything below is inert: no occurrence row is created, no
-- seat is claimed, nothing renders. Set one only for a class that genuinely
-- turns people away, and only once the declaration counts justify it:
--
--   select gym_slot_id, scheduled_for, count(*)
--   from public.slot_declarations
--   where status = 'declared' and scheduled_for > now() - interval '28 days'
--   group by 1, 2 order by 3 desc;
--
-- ON CONCURRENCY: there is no hand-rolled compare-and-swap here, because
--
--     update public.class_occurrences set taken = taken + 1
--      where id = $1 and taken < capacity;
--
-- already is one. Under READ COMMITTED the second writer blocks on the row
-- lock, then re-evaluates the predicate against the committed value. At ~8
-- declarations against a 20-person mat the expected collision rate is roughly
-- one per three centuries; the statement above would be correct even if it
-- were one per second.

alter table public.gym_slots
  add column if not exists capacity int check (capacity is null or capacity > 0);

comment on column public.gym_slots.capacity is
  'Seats this class may sell through the app. NULL = uncapped and all capacity machinery stays inert. Counts declarations, NOT bodies — walk-ins are invisible to it.';


-- One row per actual occurrence of a recurring slot, created lazily on first
-- claim. gym_slots is a recurring template with no per-occurrence identity, so
-- without this there is nothing to hold a count against.
create table if not exists public.class_occurrences (
  id          uuid primary key default gen_random_uuid(),
  gym_slot_id uuid        not null references public.gym_slots(id) on delete cascade,
  starts_at   timestamptz not null,
  capacity    int         not null check (capacity > 0),
  taken       int         not null default 0 check (taken >= 0),
  created_at  timestamptz not null default now(),
  unique (gym_slot_id, starts_at)
);

alter table public.class_occurrences enable row level security;

drop policy if exists "occurrences readable" on public.class_occurrences;
create policy "occurrences readable" on public.class_occurrences
  for select using (auth.role() = 'authenticated');

-- Writes go through declare_slot only.
revoke insert, update, delete on public.class_occurrences from authenticated;
revoke all on public.class_occurrences from anon;


-- ── declare_slot v2: claim a seat when the class has a capacity ─────────────
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
  d          public.slot_declarations;
  v_slot     public.gym_slots;
  v_name     text;
  v_coach    text;
  v_mins     int;
  v_occ      uuid;
  v_claimed  boolean := false;
  v_existing uuid;
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
    v_name  := v_slot.class_name;
    v_coach := v_slot.coach_name;
    v_mins  := v_slot.duration_min;
  else
    if btrim(coalesce(p_class_name, '')) = '' then
      raise exception 'a session needs a name';
    end if;
    v_name  := left(btrim(p_class_name), 40);
    v_coach := null;
    v_mins  := least(greatest(coalesce(p_duration_min, 60), 10), 240);
  end if;

  -- ── seat claim ────────────────────────────────────────────────────────────
  -- Only for a capped class, and only when this member is not already holding
  -- a seat on this occurrence — otherwise re-declaring the same slot (which the
  -- upsert below treats as idempotent) would consume a second seat each time.
  if p_kind = 'class' and v_slot.capacity is not null then
    select id into v_existing
    from public.slot_declarations
    where fighter_id = auth.uid()
      and gym_slot_id = p_gym_slot_id
      and scheduled_for = p_scheduled_for
      and status = 'declared';

    if v_existing is null then
      insert into public.class_occurrences (gym_slot_id, starts_at, capacity)
      values (p_gym_slot_id, p_scheduled_for, v_slot.capacity)
      on conflict (gym_slot_id, starts_at) do nothing;

      update public.class_occurrences
         set taken = taken + 1
       where gym_slot_id = p_gym_slot_id
         and starts_at   = p_scheduled_for
         and taken < capacity
      returning id into v_occ;

      if v_occ is null then
        raise exception 'that session is full';
      end if;
      v_claimed := true;
    end if;
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

  -- The upsert may have displaced a declaration for a DIFFERENT capped class at
  -- the same instant. Give that seat back, or it is held by nobody forever.
  if v_claimed then
    update public.class_occurrences o
       set taken = greatest(0, o.taken - 1)
      from public.gym_slots g
     where g.id = o.gym_slot_id
       and o.starts_at = p_scheduled_for
       and o.gym_slot_id <> p_gym_slot_id
       and not exists (
         select 1 from public.slot_declarations sd
          where sd.fighter_id = auth.uid()
            and sd.gym_slot_id = o.gym_slot_id
            and sd.scheduled_for = o.starts_at
            and sd.status = 'declared'
       );
  end if;

  return d;
end $$;

revoke all on function public.declare_slot(uuid, text, text, timestamptz, int) from public, anon;
grant execute on function public.declare_slot(uuid, text, text, timestamptz, int) to authenticated;


-- ── release a seat when a member declines ──────────────────────────────────
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

  -- Declining frees the seat. Honouring does not — the member was there, and
  -- the room was as full as the count said.
  if d.id is not null and p_status = 'declined' and d.gym_slot_id is not null then
    update public.class_occurrences
       set taken = greatest(0, taken - 1)
     where gym_slot_id = d.gym_slot_id
       and starts_at   = d.scheduled_for;
  end if;

  return d;
end $$;

revoke all on function public.resolve_slot(uuid, text, text, text) from public, anon;
grant execute on function public.resolve_slot(uuid, text, text, text) to authenticated;
