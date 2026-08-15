# HYBRID COMBATIVE — PLAYER HUD

A brutalist, sensory-driven combat-fitness PWA for Hybrid Combative (Damansara, Malaysia).
Kills manual gym data entry with AI OCR, enforces biomechanics with on-device pose vision,
and wraps it in localized RPG progression.

**No ads. No fluff. Just work.**

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. With no `.env.local` the app boots straight into
**DEMO MODE** — mock fighter, mock vision, no auth, no persistence. Everything is
clickable immediately.

To go live:

```bash
cp .env.example .env.local
```

…then fill in the values below.

---

## Environment

| Variable | Required | Effect when blank |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | for persistence | Demo mode: auth bypassed, mock fighter served |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for persistence | as above |
| `NEXT_PUBLIC_SITE_URL` | for magic links | defaults to `http://localhost:3000` |
| `ANTHROPIC_API_KEY` | for real vision | `/api/vision` returns deterministic mock payloads tagged `source: "mock"` |
| `ANTHROPIC_MODEL` | no | defaults to `claude-sonnet-5` |
| `NEXT_PUBLIC_MEDIAPIPE_WASM` | no | jsDelivr CDN |
| `NEXT_PUBLIC_POSE_MODEL` | no | Google-hosted `pose_landmarker_lite` |

Demo mode and live mode are independent: you can wire up Supabase without an
Anthropic key (real accounts, mock OCR), or vice versa.

---

## Database

Run these in order in the Supabase SQL editor. All are idempotent — safe to re-run.

1. `supabase/schema.sql` — core tables, RLS, XP engine
2. `supabase/migrations/002_slots_and_shields.sql` — gym timetable, slot declarations,
   shield ledger; replaces `award_xp` so shields mint from session count, not streak days
3. `supabase/migrations/003_coaching_ladder.sql` — per-technique ladder state, and a
   `ladder_stage` column on `home_sessions` so an 82% during a silent probe is
   distinguishable from an 82% with cues

`schema.sql` creates:

- `fighters` — profile, five combat stats, streak, rest shields, biometrics, medical flags
- `workout_logs` — Gym Mode captures with the raw OCR payload retained
- `home_sessions` — Shadow Dojo drills with form score, fatigue zones, strain flags
- `nutrition_logs` — meal captures with macros and coach commentary
- `bounties` — quest definitions (seeded with six)

…plus **row-level security on every table** (a fighter can only ever touch their
own rows), a `handle_new_user` trigger that stubs a fighter row on signup, and two
`SECURITY DEFINER` functions:

- `award_xp(fighter, stat, amount, rest_day)` — banks XP, recomputes level, advances the streak. Re-checks `auth.uid()` internally so it cannot be called for someone else.
- `log_rest_day(fighter)` — keeps a streak alive without stat XP.

---

## Routes

Bottom nav is **NOW · FUEL · GYM · DOJO · STATS** — five top-level places, at the ceiling.

`/now` is the landing route, not the scoreboard. The modal event in a fitness app is the
moment someone decides *not* to go, and a scoreboard is the worst possible screen to show
them at that moment.

| Route | Nav | What it is |
|---|---|---|
| `/now` | ✅ | **TEMPO + THE SLOT.** The pre-decision surface — see below |
| `/hud` | ✅ | Stats: level, hexagonal stat radar, bounties, combat log |
| `/fuel` | ✅ | **Nutrition.** Today's macros vs target, meal log, target derivation |
| `/fuel/capture` | | Meal capture (nutrition vision, mode-locked) |
| `/scanner` | ✅ | **Gym Mode.** Equipment OCR only (mode-locked) |
| `/home-base` | ✅ | **Shadow Dojo.** On-device pose tracking, live form scoring, Fatigue-vs-Failure |
| `/onboarding` | | Five-step terminal induction |
| `/brag` | | 1080×1920 story cards. Reached from the HUD profile |
| `/api/vision` | | POST endpoint backing both capture flows |
| `/offline` | | Service-worker fallback shell |

**Why FUEL is a tab and BRAG isn't.** You eat 3–5× a day and train once — nutrition
was the highest-frequency interaction in the app and it was buried as a toggle inside
a camera screen. BRAG is a weekly action; it was holding 25% of the primary nav for
something you do occasionally, so it moved to the HUD profile.

### Macro targets

`src/lib/nutrition.ts` derives daily targets from the biometrics captured at
induction — which, before this, were collected and then never used for anything.

```
BMR       Mifflin-St Jeor (age, sex, height, weight)
        x activity factor  (1.3-1.75, from sessions actually logged in the last 7 days)
        = maintenance
        x goal adjustment  (weight cut -20%, fight prep -10%, else maintenance)
        = calorie target, floored at 1.1 x BMR
protein   2.0 g/kg cutting, 1.8 g/kg otherwise
fat       25% of calories
carbs     remainder
```

The floor matters: an aggressive deficit on a light fighter otherwise produces a
genuinely unsafe number, and it's unit-tested. `/fuel` shows the whole derivation
rather than just the answer, flags when biometrics were incomplete, and escalates
to a "get this signed off" note when the fighter has declared a condition that diet
directly affects (hypertension, diabetes, cardiac, renal, thyroid, pregnancy).

These are training estimates, not clinical nutrition advice, and the UI says so.

---

## The XP engine

Straight from the spec:

```
XP_OCR   = (calories × 1.5) + (active_minutes × 2)
XP_Home  = (accuracy × 1.2) + (duration_minutes × 3)
Level    = floor(0.1 × sqrt(total_xp)) + 1
```

Implemented in `src/lib/xp.ts` and mirrored in SQL (`public.level_for_xp`) so the
client and database never disagree.

**Radar chart.** The spec lists five stats but asks for a hexagon, so a sixth
axis — **DISCIPLINE**, derived from streak length — was added to actually close
the shape. Raw stat XP is mapped onto 0–100 through a diminishing-returns curve
(`100 × (1 − e^(−xp/1200))`) so a high-level fighter still has visible headroom.

## TEMPO and THE SLOT (`/now`)

Two features that replace the streak and give the app a surface that exists *before*
the decision to train. Both came out of the market research in
[docs/PRODUCT-DIRECTION.md](docs/PRODUCT-DIRECTION.md).

### TEMPO replaces the streak

A streak that can reach zero is a churn detonator wearing a motivation costume: one
missed session turns a number into an identity verdict, and the app gets deleted.
Around [75% of health-app users quit within two weeks](https://www.maticdigital.com/blog/signals/why-fit-tech-apps-are-still-losing-users-and-how-smarter-ux-fixes-it).

TEMPO is a rolling 28-day sessions-per-week figure. Missing one session moves it by
**0.25** — "3.1/wk, down from 4.0" is recoverable in a way that "0" is not. It carries a
band label (DORMANT → SPORADIC → BUILDING → CONSISTENT → SHARP → RELENTLESS) so the
fighter gets an identity rather than a verdict, and a trend against the previous 28 days.

It's derived purely from session timestamps, so it needed **no schema migration** and
cannot drift out of sync with the logs.

### Shields are earned now, not gifted

The old rule handed out a free shield every 7 streak days. Slack that costs nothing
provides no persistence benefit — it was decoration that looked like a feature.

Now every **5 sessions mints** a shield (bank capped at 3), and spending one requires
naming a reason. That friction is the mechanism. `spend_shield()` recomputes the bank
from earned-minus-spent server-side, so the client cannot invent shields.

Ramadan, Raya, CNY and Deepavali arm a **protected window** automatically — those are the
calendar, not an adherence failure. The dates in `PROTECTED_WINDOWS` are flagged
`approximate: true` and must be confirmed against an authoritative Hijri source before
they drive user-visible copy.

### THE SLOT

A declared intention: a day, a time, and a named coach, picked against the real timetable.

| Phase | What the app does |
|---|---|
| **T-90** | One tactical line naming the friction most likely to stop the session — *"Pack the bag now, not later — that is the step people skip."* |
| **T-30** | A **graded downgrade**, never a binary. `DOJO 20` or `MOBILITY 8`, both of which count as sessions and hold tempo |
| **After** | If it didn't happen, one tap logs *why*: `kerja / penat / sakit / jam / family` |

The decline-reason log is the point. Nobody in this market has that dataset, and it's
what a coach console would eventually be built on.

Slot state is computed in `src/lib/slots.ts` and unit-tested against phase boundaries
(T-91 vs T-90, in-progress, the 60-minute grace window, lapsed).

---

## Gym Mode (`/api/vision`)

Returns exactly the envelope the spec defines:

```json
{
  "status": "success",
  "type": "equipment_ocr" | "nutrition_vision",
  "data": { },
  "roast_or_hype": "Short localized coach cue.",
  "source": "live" | "mock"
}
```

Notes on the implementation:

- **Structured outputs** (`output_config.format` with a JSON schema) guarantee the
  response parses — no regex scraping, no retry-on-bad-JSON loop.
- `thinking` is **disabled** and `effort` is `low`. On a gym floor, latency beats depth.
- The coach line is a schema field rather than free text, then lifted into the
  envelope — you cannot have both constrained JSON and loose prose in one response.
- **Every number is editable before banking.** Console glare is real; the review
  screen lets the fighter correct the reading, and the corrected value is what earns XP.
- The route guards mime type, decoded payload size (5 MB), and maps
  rate-limit / connection / refusal cases to distinct HTTP statuses.
- With no API key it serves seeded mock data, clearly tagged `MOCK DATA` in the UI.

**`claude-sonnet-5` is the default model.** The spec named "Claude 3.5 Sonnet";
that ID is retired, so this targets the current Sonnet-tier model. Override with
`ANTHROPIC_MODEL`.

### The capture gate (why this isn't live vision)

Continuous "point the camera and watch it read" was considered and rejected:
a vision round-trip is 1–3s so nothing you overlay is current; throttled to one
call every 2s a 20-second hover costs ~10 calls against ~1 for a still; and the
reading would flicker between dishes while the number it produces is banked as XP.

Instead `src/lib/frame-quality.ts` scores frames **on-device**, ~3× a second, with
no network involved:

| Metric | How | Reading |
|---|---|---|
| **Focus** | Variance of the Laplacian over a 160×120 luma plane | Low = motion blur or out of focus |
| **Light** | Mean luma, penalised at *both* ends | Catches under- and over-exposure |
| **Frame** | Share of total edge energy inside the centre 36% box | Is the subject actually centred? |

The viewfinder shows all three live; when every one clears its floor the status
reads `TARGET LOCKED` and the shutter turns gold. It's a **soft gate** — a poor
score dims the button and renames it `CAPTURE ANYWAY` rather than blocking, because
odd gym lighting shouldn't stop someone logging a set.

Net effect: zero added API cost, zero added latency, and the one call you do spend
is spent on a frame worth reading. `scoreImageData` is pure and unit-tested
(21 assertions) — including the case that proves framing is doing independent work:
a perfectly sharp, perfectly lit frame with detail spread edge-to-edge scores
Focus 100 / Light 100 / **Frame 3** and correctly refuses to lock.

---

## Shadow Dojo (`/home-base`)

MediaPipe Pose runs **entirely in the browser**. No video frame ever leaves the
device — only the rep count, form score, and flagged zones are persisted. Drills
are capped at 2–5 minutes to limit battery drain, and a screen wake-lock is held
for the duration of a set.

Five drills, each with its own evaluator in `src/lib/drills.ts`:

| Drill | Rep signal | Watched for |
|---|---|---|
| Jab–Cross Shadow | elbow extension, alternating arms | dropped guard, shrugged shoulders |
| Fighter Squat | knee angle < 100° → > 158° | forward fold (lumbar), knee valgus |
| High Knees | knee above hip, alternating | backward lean |
| Combat Push-Up | elbow angle < 100° → > 158° | sagging hips |
| Fight Plank | hold | sag and pike |

Strain flags are **debounced over 8 consecutive frames**, so one noisy landmark
can't red-flag a joint. Reps require a full cycle — a half rep does not count —
and alternating drills reject the same side twice in a row.

### The Coaching Ladder

Every other app cues harder the longer you use it, which produces dependency: you
perform well *while being corrected* and worse the moment the cues stop. The ladder
inverts that — feedback **withdraws** as competence rises.

| Stage | What the app shows during the set |
|---|---|
| **ACQUIRE** | Every cue, every rep |
| **BANDWIDTH** | Cues only when the score drops outside tolerance |
| **SUMMARY** | Silent during; full report afterwards |
| **SILENT PROBE** | No cues *and no running score* — a visible number is itself feedback |
| **MASTERED** | Silent, spot-checked. Decays if it stops holding |

A technique is not levelled until it survives a **silent probe**. Two clean sessions
promote you a rung; a score well under the bar demotes you; failing a probe drops you
back to SUMMARY with the line *"the cues were carrying more than it looked."*

Two deliberate carve-outs: **strain warnings never fade** — safety isn't a feedback
policy — and tracking-loss messages show at every rung because they're a system fault,
not coaching. Scoring always runs at full fidelity; only the *display* fades.

The general principle (constant feedback aids performance but harms retention; faded
and bandwidth feedback improve it) comes from the motor-learning literature. **The
specific thresholds in `src/lib/ladder.ts` are product choices, not values from a
study** — that's stated in the source too, and they want calibrating against real
sessions before anyone claims otherwise.

### Fatigue vs Failure

The post-set check is the point of the whole module. The fighter taps where they
feel it on an SVG anatomy map, and the tap is classified:

- **Fatigue** — the muscle the drill was built to load. Expected. No intervention.
- **Failure** — a joint, or a muscle that had no business working. The pattern
  broke down, so the loop is intercepted and a **two-minute corrective** is queued
  before they go again (`src/lib/corrective.ts` has one per region).

A session that ends with strain flags routes its XP to **recovery** rather than
the drill's own stat — the fighter earned rehab, not more volume.

---

## Design system

The archetype is **Tactical Telemetry / CRT terminal** — committed to, not mixed with
the Swiss-print light variant. Three rules do most of the work:

1. **Extreme scale contrast.** Hero numerals run `clamp(4.5rem, 26vw, 8rem)` (~98px on
   a 375px phone) against 9px tracked monospace metadata — roughly a 10:1 ratio. Flat
   mid-size type everywhere was the single biggest thing making this read as generic.
2. **Gold is an accent, not wallpaper.** `#FFC107` marks vital data and exactly one
   primary action per screen. Body copy is white phosphor. Red is strictly hazard;
   green has a single job (optimal muscle engagement / cleared objective).
3. **Simulated hardware limits.** A CRT scanline layer and an SVG grain layer sit over
   the document so it doesn't read as flat vector. Both vanish under
   `prefers-reduced-motion`.

### Tokens

| Token | Value | vs `canvas` | vs `surface` |
|---|---|---|---|
| `canvas` | `#0A0A0A` | — | — |
| `surface` / `edge` | `#121212` / `#262626` | — | — |
| `phosphor` (body text) | `#EAEAEA` | 16.5:1 | 15.6:1 |
| `dim` | `#A3A3A3` | 7.9:1 | 7.4:1 |
| `faint` (micro labels) | `#828282` | 5.2:1 | 4.9:1 |
| `gold` (vital data) | `#FFC107` | 12.2:1 | 11.5:1 |
| `fight` (hazard) | `#FF2A2A` | 5.3:1 | 5.0:1 |
| `engage` (single-purpose) | `#22C55E` | 8.7:1 | 8.2:1 |

Every one clears WCAG AA **against both substrates**, measured in-browser rather than
eyeballed. Two failures got shipped before that discipline held:

1. A `#5A5A5A` micro-label at **2.87:1** — a straight failure at 9px.
2. `faint` at `#7A7A7A`, which cleared 4.6:1 against `canvas` and was signed off on
   that basis — but `Panel` is `bg-surface`, so most faint text in the app actually
   sat at **4.36:1**. Measuring against the darkest background flatters the ramp;
   the column that matters is the lightest surface a token lands on.

An in-browser audit that composites translucent layers down to the page background
now runs over every route — `text-canvas/60` on a gold nav chip measured 4.47:1 and
was raised to `/70`.

### Type

**Archivo Black** for macro-typography, **JetBrains Mono** for all telemetry, both via
`next/font`. Display type carries negative tracking (`-0.03em` to `-0.05em`) and
compressed leading (`0.78`–`0.95`) so it forms solid architectural blocks.

> Deviation from the brief: the spec named Teko/Bebas Neue. Teko is too light to carry
> 98px hero numerals — it reads sporty rather than brutal. Archivo Black is the heavy
> neo-grotesque the archetype calls for. Swap it in `src/app/layout.tsx` if you'd
> rather keep Teko.

### Structure

1px hard borders, square corners everywhere (`border-radius` is zeroed globally,
including `rounded-full`). Hairlines come from `display:grid; gap:1px` over a
contrasting parent (`.rule-grid`) rather than per-child borders. Structural headers use
`[ ASCII FRAMING ]`; barcode strips, registration marks, hazard chevrons, and
`REV / 2.6`-style unit strings do the industrial signposting.

Touch targets are ≥44px throughout and focus rings are 2px gold — both audited in-browser.

> **Canvas gotcha worth knowing:** `next/font` emits a *hashed* family name
> (`__Archivo_Black_93a132`), so `ctx.font = "700 96px Archivo Black"` silently falls
> back to Impact. `/brag` reads the real family from the `--font-display` CSS variable
> and calls `document.fonts.load()` for each face before drawing.

> **Tailwind gotcha:** editing `tailwind.config.ts` does **not** always hot-reload in
> `next dev` — new `fontSize`/`colors` utilities silently fail to generate and elements
> fall back to inherited values. Restart the dev server after touching the config.

---

## PWA

`public/manifest.webmanifest` + `public/sw.js`. The service worker registers in
production only: cache-first for build assets, network-first for pages with an
`/offline` fallback. API and auth traffic is never cached.

Icons ship as SVG. If you need raster icons for older Android, export
`public/icons/bull.svg` to 192/512 PNG and add them to the manifest.

---

## Tooling (Claude Code)

Project-scoped agents and skills, installed from public catalogues. The `.claude/agents`
markdown is committed; skill bodies live in `.agents/` and are gitignored because they're
re-installable.

**Subagents** — `.claude/agents/`, from [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates):

| Agent | Why it's here |
|---|---|
| `visual-analysis-ocr` | Extracting structured data from console photos |
| `ocr-preprocessing-optimizer` | Image prep before the vision call — the highest-leverage accuracy win |
| `ocr-quality-assurance` | Validating OCR output before it becomes XP |
| `text-comparison-validator` | Diffing model readings against ground truth |
| `code-reviewer` | General review pass |

```bash
npx claude-code-templates@latest --agent ocr-extraction-team/visual-analysis-ocr --yes
```

**Skills** — from [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills):
`image-enhancer` (OCR input prep) and `webapp-testing` (browser-driving this PWA).

```bash
npx skills add https://github.com/ComposioHQ/awesome-claude-skills --skill "image-enhancer"
```

Most of that catalogue duplicates Anthropic's own skill set, so only the two genuinely new
and relevant ones are installed.

**Marketplaces** — `anthropics/skills` and `VoltAgent/awesome-claude-code-subagents` are
registered; three VoltAgent packs (`core-dev`, `lang`, `qa-sec`) are installed at user scope.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

> Don't run `npm run build` while `npm run dev` is live — they share `.next` and
> the dev server will start throwing `Cannot find module './xxx.js'`. Stop dev first,
> or delete `.next` and restart.

---

## Logging a session (`/log`, `src/lib/session.ts`)

The app used to see only two things: a cardio console it could OCR, and a solo
drill done at home. Everything else on the floor — free weights, machines, spin,
HIIT, yoga, the mats, coached sessions — trained invisibly. That is most of a
mixed membership, and it had three consequences beyond a wrong scoreboard:

- XP was ~88% driven by calories, so a member walking on a treadmill out-earned
  a member squatting heavily, and anyone in a class earned nothing.
- `activityFactorFor()` reads the session count, so members who could not log
  were handed macro targets computed as if they were sedentary.
- Shields mint per session, so a member who only lifted never earned one.

`/log` is three taps — what, how long, how hard — with duration and RPE
pre-filled per modality. Session load is `duration x RPE` (Foster's sRPE), the
standard cross-modality internal-load measure, and it is also the XP. There is
deliberately **no per-modality multiplier**: the moment COMBAT is worth 1.2x,
the app is telling half the membership their training counts less.

RPE is presented against Borg CR10 word anchors rather than a bare number,
because members rate far more consistently against "a few words, breathing
heavy" than against "8".

## Push reminders (`src/lib/push.ts`, `public/sw.js`)

THE SLOT computes an approaching / imminent / lapsed phase machine. Until
migration 006 none of it could reach anybody: `sw.js` handled `install`,
`activate` and `fetch` only, so a reminder rendered **only for someone who had
already opened the app** — which is never the person deciding not to come. The
product's whole pre-decision thesis sat on a pull-only channel.

Now: `push` / `notificationclick` / `pushsubscriptionchange` in the service
worker, `push_subscriptions` with RLS, and `due_slot_reminders()` returning the
(subscription, declaration) pairs inside the T-90 and T-30 bands.

Two things that are easy to get wrong and are handled deliberately:

- **The permission prompt fires once, from a tap, never on load.** A denied
  `Notification` permission is effectively permanent — the browser stops asking
  and the member must dig through site settings. A mistimed ask does not cost one
  nudge, it costs the channel for that member forever. So the ask attaches to
  *declaring a slot*: the member has just said they intend to be somewhere.
- **iOS only exposes the Push API to a home-screen-installed app.** In a normal
  Safari tab `window.PushManager` is absent, so `pushSupport()` detects it and the
  copy explains the install step instead of showing a toggle that cannot work.

The ask is wired to declaring a slot on `/now`. Verified in-browser: declaring
surfaces the offer card and **does not** fire the browser permission dialog;
only tapping *Remind me* does. With permission already denied, the offer is
suppressed entirely rather than shown as a dead button.

> **The sender is not built.** `due_slot_reminders()` is designed to be called by
> a Supabase Edge Function on a `pg_cron` schedule (~every 5 minutes; the bands
> are ±5 min so a run cannot skip one) using the service-role key — the function
> is deliberately revoked from `authenticated` because it reads across members.
> That function, and the VAPID signing, still need writing and deploying.

## Voice portion notes (`src/lib/voice.ts`)

A photo is a 2D signal with no depth, so **portion — not identification — is the
dominant error term** in image-based macro estimation. Published evaluations put
AI macro error at 48–66%, and repeatedly name portion estimation as the
bottleneck; one system had strong recognition but 39% reliability on portion.
A weighed-truth cross-over study found spoken/text portion descriptions land
within 10% of truth **31% of the time versus 13% for image-based** estimation
([PMC9291996](https://pmc.ncbi.nlm.nih.gov/articles/PMC9291996/)). Drinks are the
worst image category at ~118% overestimation — which in this market means teh
tarik and kopi peng.

So this feature is **not** "describe your meal". Vision already names the dish
well. It asks the one thing the photograph cannot answer — *how much*.

**Where it sits: on the review screen, after the estimate.** The fighter corrects
a number they can see is wrong, rather than narrating blind into a capture screen.
First-call latency is untouched, and it costs nothing when unused.

The same photo, with only the spoken portion varying:

| Voice note | kcal | Confidence |
|---|---|---|
| *(none — photo only)* | 579 | low |
| "half only, I tapau the rest, one palm chicken no skin" | 347 | high |
| "one fist rice maybe, not sure how much exactly" | 492 | **medium** |
| "two fist of rice, extra sambal, big piece chicken" | 811 | high |

A 2.3× spread on one photograph. Note row three: stated uncertainty *caps*
confidence rather than raising it.

Design decisions that carry weight:

- **The prompt is targeted, never open-ended.** `voicePrompt()` picks one
  question ordered by where the error actually is: drinks → low confidence →
  preparation (skin on/off is a large fat delta a photo can't see under sauce)
  → portion. Short utterances also transcribe far better, because code-switching
  costs a 30–50% WER increase and fewer words means fewer switch points.
- **Hand references are shown next to the mic.** People don't say "one palm of
  chicken" unless you show them that's the expected unit.
- **The transcript is always shown and editable before use.** Manglish
  transcribes badly; silently feeding a garbled note into a health-adjacent
  estimate is the failure mode to avoid. `usableTranscript()` additionally
  rejects the artefacts providers emit on silence ("you", "Thank you").
- **The transcript is screened for contraindications.** Saying "with ikan bilis"
  raises the same hypertension flag as the model writing it — verified
  end-to-end. Voice adds information the photo never contained, and that
  information can matter medically.
- **The transcript is treated as untrusted.** It's capped, control-stripped, and
  the directive tells the model to ignore instructions embedded in it.

**STT is a mandatory separate hop** — the Claude Messages API takes text and
images, not audio, so audio is transcribed and the transcript is sent as a text
block *alongside* the image in one call. Provider is env-selected
(`ELEVENLABS_API_KEY` / `OPENAI_API_KEY`) with a mock fallback.

> **Untested claim:** the directive tells the model to repair garbled food names
> using the image ("quay tow" + visible flat noodles → kway teow). That's
> mechanistically plausible but **I found no evidence for it**, and it isn't
> verified here. It matters commercially — if it holds, a cheaper STT is fine.
> Test it with ~20 real Manglish recordings in an actual food court before
> committing to a provider.

**Web Speech API was rejected**, despite being free: it does not work in an
installed PWA on iOS Safari, and installing is the point of this app.

Verified by 47 assertions (`voice-test.js`) plus a browser-driven end-to-end run
using a synthetic `MediaStream` (no microphone in the verification environment).

## Interaction screen (`src/lib/contraindications.ts`)

The app asks for medical conditions at induction, then generates nutrition
targets and free-text coach lines from a vision model that has never seen those
conditions. Left alone, that produces the obvious failure: a fighter declares
acid reflux and the coach suggests a squeeze of lime.

So model output is screened **before it is rendered**, not after:

| Surface | Screened subjects |
| --- | --- |
| `/fuel` | `protein_target` (the app's own prescription) + every logged dish and coach comment |
| `/fuel/capture` | Coach line, dish name, portion note, every item on the plate |
| `/scanner` | Coach line — "smash a pre-workout" is a real thing it says |

Design constraints, all load-bearing:

- **It never diagnoses and never prescribes.** Every note defers outward
  ("check with a doctor or dietitian"). A unit test asserts no rule's text
  matches prescribing language.
- **It fails safe in one specific direction.** Negation detection requires the
  negating phrase to be *adjacent* ("no history of reflux"). A wider window
  would suppress the real declaration in "no diabetes, but I do get reflux" —
  and suppressing a true warning is the failure this module exists to prevent.
  Anything ambiguous flags.
- **Accuracy over coverage.** High protein is flagged for kidney disease, which
  is a genuine clinical issue, and *not* flagged generally, which would be
  scaremongering. Rules graded `common` (e.g. sulphite sensitivity in asthma)
  are withheld unless explicitly requested; `theoretical` is never surfaced.
- **The table is small on purpose.** A wrong row is worse than a missing one,
  because the fighter will believe it.

> **Not clinically reviewed.** Every row carries `reviewed: false`, and that is
> accurate — the entries are drawn from standard, widely published dietary
> guidance, but **nobody qualified has signed this table off for this gym.**
> Have a doctor or dietitian review `INTERACTIONS` and flip `reviewed` before
> this is presented to members as anything more than a prompt to ask someone.
> The `source` field on each row exists to make that review possible.

Verified by 94 assertions (`contra-test.js`), covering the reflux/lime case
directly, the negation failure direction, evidence gating, severity ordering,
and — importantly — that unremarkable meals produce no flags at all.

## Known gaps

- **`npm audit` reports 2 high advisories** in `postcss`, pulled in transitively by
  Next 14. The only fix npm offers is Next 16, which is a breaking major and against
  the spec's "Next.js 14" requirement. It is a build-time CSS parsing issue, not a
  runtime exposure. Revisit if you move to Next 15/16.
- ~~No automated test suite is wired into the repo.~~ **Fixed.** `npm test` runs
  Vitest over `src/lib/__tests__` against the real modules. Two defects surfaced
  during the port, both worth knowing about:
  1. The harnesses tally pass/fail and `console.log` failures — they never throw.
     The port dropped the final tally line, so **five of eight suites reported
     green regardless of their assertions** (~180 of them, silently vacuous). Each
     now ends with `assert.equal(fail, 0)` and `assert.ok(pass > 0)`.
  2. Verified by mutation: breaking `sessionLoad`, and separately a TEMPO band
     threshold, each produce a failing suite; both pass again on restore.

  The suites are excluded from `npm run typecheck` — they are ported plain JS, not
  strict TS, and are not shipped. See the note in `tsconfig.json`.
- **Read the rest of this README as intent, not description.** An external audit
  found several places where the copy asserted behaviour the code did not have
  (`"That is the one that counts"`, `"Week protected"`). Those specific three are
  now fixed, but the general warning stands: verify against the code.
- **Voice notes were never tested against real speech.** The verification environment
  has no microphone, so the record → transcribe → re-estimate path was driven with a
  synthetic `MediaStream` and mock transcripts. Real code-switched Manglish in a real
  food court is the actual test, and it has not happened.
- **The interaction table needs clinical sign-off** before it is relied on — see the
  Interaction screen section above. It is currently a prompt to ask a professional,
  which is all it claims to be.
- **Live cue suppression is verified by unit test, not end-to-end.** `cuePolicy()` is
  tested exhaustively and the setup screen renders the right policy, but no automated
  test drives a real pose session — that needs a camera and a human in frame.
- **The gym timetable is seeded with placeholder classes and coaches.** Replace the
  `gym_slots` seed in `002_slots_and_shields.sql` with the real Damansara schedule before
  anyone uses THE SLOT for real.
- **Protected-window dates are approximate.** The Hijri dates in `PROTECTED_WINDOWS`
  (`src/lib/tempo.ts`) are flagged as such in code and must be confirmed before shipping.
- **Camera flows were not exercised end-to-end** — the verification environment has no
  webcam. The capture → analyze → review → bank path was verified through the file-upload
  branch, which shares all downstream logic. Point a real phone at a real assault bike
  before trusting the OCR prompt.
- **The reference repos in the spec were not cloned.** Their mechanics (pose tracking,
  XP ladders, mobile state) are implemented directly rather than synthesized from
  `./refs/`.
- Bounty progress is computed per-request from logs. At a few thousand rows per fighter
  this wants a materialized weekly rollup.
