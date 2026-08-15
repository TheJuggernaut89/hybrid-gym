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

> **004 renames columns** (`striking_xp → craft_xp`, `stamina_xp → engine_xp`,
> `agility_xp → power_xp`). It is guarded by `information_schema` checks so it is
> safe to re-run, but if you have an existing deploy, take a backup first. The
> app code will not work against pre-004 columns.

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
