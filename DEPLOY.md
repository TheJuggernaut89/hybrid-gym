# Deploying to Netlify

The app builds and runs today. What it *does* depends entirely on which
environment variables are set — every integration degrades to a working mock
rather than crashing, which is convenient for a first deploy and dangerous if
you mistake a mock for the real thing. This file is the checklist for telling
them apart.

---

## 0. Enable extensions first

`pg_cron` and `pg_net` are **not** enabled by default on a fresh Supabase
project, and §3 fails on its first statement without them
(`ERROR: schema "cron" does not exist`). SQL editor, once:

```sql
create extension if not exists pgcrypto;
create extension if not exists pg_cron;   -- must be created in the `postgres` database
create extension if not exists pg_net;
```

## 1. Database — do this before the first deploy

> **Run the migrations before anyone signs in.** The `handle_new_user` trigger
> that creates a member's row lives in `schema.sql`. An account created before
> that trigger exists gets no `fighters` row, and running the migrations later
> does **not** backfill it.

Run these in order in the Supabase **SQL editor**. Do not use `supabase db
push`: `schema.sql` lives at `supabase/schema.sql`, *outside* `migrations/`, so
`db push` would start at `002` and fail on `relation "public.fighters" does not
exist` — leaving a half-built database.

| File | What it does |
| --- | --- |
| `schema.sql` | Base tables, RLS, `award_xp`, `level_for_xp` |
| `002_slots_and_shields.sql` | Timetable, slot declarations, shield ledger |
| `003_coaching_ladder.sql` | Per-technique ladder state |
| `004_universal_sessions.sql` | **Renames stat columns**, adds `training_sessions`, `log_session` |
| `005_shields_actually_protect.sql` | Makes a spent shield actually protect the streak |
| `006_push_subscriptions.sql` | Push subscription storage + `due_slot_reminders()` |
| `007_class_quota.sql` | Per-member class allowance for the tier-upgrade offer |
| `008_lock_down_reminder_rpc.sql` | **Security fix** — stops `anon` reading every member's push credentials |
| `009_fix_declaration_timezone.sql` | Repairs declarations stored 8 hours off. Prints anything it could not explain |
| `010_xp_awarded_once.sql` | `log_session` no longer pays for the same session on every replay |
| `011_send_each_reminder_once.sql` | Adds `slot_notifications`; each reminder now sends once per device |
| `012_retire_the_streak.sql` | `award_xp` v5 drops the streak and moves off UTC dates; retires `STREAK_SEVEN`; `spend_shield` covers a week and stops burning shields for nothing |
| `013_penuh_decline_reason.sql` | Adds `penuh` — the gym was full. Replaces the inline CHECK, which `if not exists` made unreachable |
| `014_floor_declarations.sql` | `coach_name` nullable, `kind` column. THE SLOT works for the weights floor |
| `015_the_nod.sql` | `nickname` + `visible_to_gym`, and `gym_mates()` with a cohort floor |
| `016_writes_go_through_functions.sql` | **Security** — members lose INSERT/UPDATE/DELETE on declarations, shields and sessions; `award_xp` gains per-call and per-day ceilings |
| `017_coach_roster.sql` | `role` column and `coach_roster()` |
| `018_class_capacity.sql` | Nullable `gym_slots.capacity`, `class_occurrences`, seat claim inside `declare_slot` |

> **004 renames columns** (`striking_xp → craft_xp`, `stamina_xp → engine_xp`,
> `agility_xp → power_xp`). It is guarded by `information_schema` checks so it is
> safe to re-run, but if you have an existing deploy, take a backup first. The
> app code will not work against pre-004 columns.

> **009 must run with the reminder cron paused, and only after the matching app
> deploy.** It shifts live declarations backwards by 8 hours. If the sender is
> running while rows move, it can fire against a time that is briefly wrong; if
> the old app code is still live, it will write fresh 8-hour-off rows behind you.
>
> ```sql
> select cron.unschedule('slot-reminders');
> ```
>
> Deploy the app, run 009, 010 and 011, then re-create the job from §6.
>
> 009 ends with a report of `declared` rows that still disagree with the
> timetable. It should be empty. Rows that appear there were not caused by this
> bug — a hand-edited timetable, or a declaration with no `gym_slot_id` — and
> need looking at rather than shifting.
>
> Run 009 **before** 014. Once floor declarations exist, 009's report lists
> every one of them as unexplained, because a floor session legitimately has no
> `gym_slot_id`.

> **012 must run after 010.** Migration 010's `log_session` calls
> `award_xp(uuid, text, int, boolean)`, and 012 redefines that function. The
> four-argument signature is preserved deliberately — changing it would leave
> `log_session` calling something that no longer exists.

> **016 removes table-level write access from members.** Anything that writes
> declarations, shields or training sessions must go through `declare_slot`,
> `resolve_slot` or `log_session` afterwards. The app already does; a bookmarked
> REST call will not. Verify:
>
> ```sql
> select table_name, privilege_type
> from information_schema.role_table_grants
> where grantee = 'authenticated'
>   and table_name in ('slot_declarations','shield_spends','training_sessions')
> order by 1, 2;
> ```
>
> Expect `SELECT` only.

**Making someone a coach** — there is deliberately no in-app path:

```sql
update public.fighters set role = 'coach' where id = '<uuid>';
```

**Capping a class** — leave this null until the declaration counts justify it.
Capacity counts declarations, not bodies, so it can tell someone a physically
full class has space:

```sql
update public.gym_slots set capacity = 20 where code = 'THU-BJJ-2000';
```

---

## 2. Environment variables

Set these in **Site configuration → Environment variables**. `NEXT_PUBLIC_*`
are inlined at build time, so **changing one requires a redeploy**, not just a
restart.

### Required for anything real

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL          # e.g. https://yourgym.netlify.app — magic links redirect here
```

Without these the app runs in **demo mode**: a fixed demo member, no auth, no
persistence. It will look like it works. It is not storing anything.

### Optional — each degrades to a mock

| Variable | Without it |
| --- | --- |
| `ANTHROPIC_API_KEY` | Vision returns deterministic mock meals and console readings |
| `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` | Voice notes return canned transcripts |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Reminder prompt never appears (private key goes to Supabase, §3) |

Generate the VAPID pair once, locally:

```bash
npx web-push generate-vapid-keys
```

The public key is safe to expose. The private key signs pushes and is a
**Supabase secret only (§3)** — nothing on Netlify reads it. Set it there and
you have exposed a signing key to no purpose.

> Netlify's `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and Supabase's `VAPID_PUBLIC_KEY`
> must be the **same key from the same generated pair**. They are read in
> different places under different names, so a mismatch subscribes members
> successfully and then every send is rejected.

### Supabase auth redirect

Add `https://<your-site>/auth/callback` to **Authentication → URL
Configuration → Redirect URLs**, or magic links will bounce.

---

## 3. Push reminders — the one piece Netlify does not host

The service worker, the subscription flow, and `due_slot_reminders()` are all
in place. The **sender** runs on Supabase, not Netlify, because it needs the
service-role key and a schedule:

```bash
supabase functions deploy slot-reminders
supabase secrets set \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:coach@yourgym.com
```

Then schedule it (SQL editor, once). Every 5 minutes — the reminder windows are
±5 min wide so a run cannot skip one:

Store the service-role key in Vault first, so it is not sitting in `cron.job`
in plain text where any admin query will surface it:

```sql
select vault.create_secret('<your-service-role-key>', 'slot_reminders_key');
```

Then schedule it:

```sql
select cron.schedule(
  'slot-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/slot-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'slot_reminders_key'
      )
    )
  )
  $$
);
```

The function is deployed **with** JWT verification, so this header is required.
Deploying `--no-verify-jwt` would leave the endpoint callable by anyone — they
could not read data, but they could trigger sends at will.

**Push will not work until this is deployed and scheduled.** Members can grant
permission and be stored as subscribers, and nothing will ever be sent.

### iOS

Push only reaches an iPhone once the member has **added the app to their Home
Screen**. In a normal Safari tab the API is absent; the app detects this and
explains the install step instead of offering a toggle that cannot work. Worth
saying out loud to members, because it is not discoverable.

---

## 4. What to check after the first deploy

0. **The red `DEMO` badge must be absent from every screen.** Check this first —
   five of the checks below pass perfectly in full demo mode, so every other
   result is meaningless until this one does.
1. `/now` renders and TEMPO shows a number.
2. Sign in with a magic link — confirms the redirect URL is right.
3. `/log` → LIFT → confirm, then reload `/now`: TEMPO and the load figure must
   move. Reading the failure correctly:
   - Confirm **errors** with `Log failed: … log_session …` → **migration 004
     has not run.**
   - Confirm **succeeds** but the message starts `DEMO MODE` and nothing moves
     → **the Supabase env vars are not set.** (A previous version of this guide
     blamed 004 for this symptom. It is the opposite: with 004 missing you
     never reach the reload.)
4. Declare a slot → the reminder prompt appears (only if VAPID is set).
5. **Prove the sender actually runs** — nothing above exercises pg_cron, pg_net,
   the Edge Function or the VAPID pair:
   ```bash
   curl -X POST https://<project-ref>.supabase.co/functions/v1/slot-reminders -H "Authorization: Bearer <your-service-role-key>"
   ```
   Expect `{"due":n,"sent":n,"pruned":n}`. Then confirm the schedule is firing:
   ```sql
   select * from cron.job_run_details order by start_time desc limit 5;
   ```
6. **Confirm vision is live, not mocked.** Log a meal — a red `MOCK DATA` tag on
   the result means `ANTHROPIC_API_KEY` is unset.
7. `/fuel` shows macro targets, and the medical flag appears for a member with
   a declared condition.
8. Install to Home Screen on a phone and confirm the app opens standalone.
9. **Confirm the reminder RPC is locked down** (it returns push credentials for
   every member):
   ```sql
   select grantee, privilege_type from information_schema.role_routine_grants
   where routine_name = 'due_slot_reminders';
   ```
   Expect `service_role` only. If `anon` appears, migration 008 has not run —
   **do not go live.**

---

## 5. Known limitations at launch

- **ROTATE THE `service_role` KEY BEFORE REAL MEMBERS USE THIS.** The key used
  during the trial build was exposed in a screenshot. Harmless for a demo
  database with no member data; unacceptable once real people have accounts.
  Rotate at Settings -> API Keys -> JWT Keys, then update
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Netlify (same JWT secret signs both) and
  re-store the new service key in Vault.

- **The interaction table is not clinically reviewed.** Every row is
  `reviewed: false`. It is a prompt to ask a professional, not advice. See the
  README section before putting it in front of members.
- **Voice notes have never been tested against real speech.** Built and verified
  with a synthetic audio stream and mock transcripts. Real code-switched
  Manglish in a food court is the actual test.
- **Pose scoring has a validity problem.** A motionless person scores near 100,
  which means a genuinely poor rep can too. The coaching ladder gates
  promotions on that score, so treat Form Check output as indicative.
- **`papan.ts` (the WhatsApp scoreboard) is written but not wired to anything.**
- **A member who signs in before the migrations run gets no `fighters` row.**
  They now land on /onboarding, which repairs it — but the row is not
  backfilled automatically, so run §1 before anyone signs in.
- **There is no coach-facing view.** Everything routes to the individual
  member's phone; nobody at the gym sees who is slipping.
- Protected-window dates (Ramadan, Raya, CNY, Deepavali) are approximate and
  flagged as such in code. Confirm them before they drive member-facing copy.
