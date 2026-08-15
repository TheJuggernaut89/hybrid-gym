# HYBRID COMBATIVE HUD — PRODUCT DIRECTION

---

## 1. NAVIGATION

**Final structure: five member tabs + one role-gated sixth.**

| Tab | Job-to-be-done | Opened | Why it earns a slot |
|---|---|---|---|
| **NOW** *(default route)* | "What am I doing next, and am I on track this week?" | Daily, incl. non-training days | The only surface that exists *before* the decision to train. Currently the app has none. Holds: today's declared slot, T-90 nudge state, 28-day TEMPO, shield bank, active protocol banner (PUASA / RAYA / HAZE), one bookable next action. |
| **TRAIN** | "Capture or run a session." | 3–5×/week | Merges `/home-base` + `/scanner` + Bag Mode. Shadow Dojo vs cardio console vs heavy bag is an *implementation* distinction, not a user job. One tab, three capture modes, one session record. |
| **FUEL** | "Log what I ate / what's in this tub." | 2–4×/day | Highest raw frequency in the app. Keeps its tab on frequency alone. Absorbs the supplement scanner (label OCR is the same pipeline as console OCR, pointed at a different object). |
| **PROGRESS** | "Am I actually getting better?" | Weekly, ritual | Everything currently on `/hud` that is *telemetry* rather than *behaviour*: level, radar, technique ledger, HRR trend, drift charts, heat ledger. High emotional payload, low frequency — which is exactly why it must not be the landing page. |
| **CREW** | "Who else is training, and what do I paste into the group?" | 1–2×/week | Absorbs `/brag`. Papan markah, witness declarations, sparring partners, WhatsApp export tier. Social accountability aimed at the twelve people who train next to you, not at strangers on Instagram. |
| **COACH** *(role-gated)* | "Who is drifting, and what did the class actually do?" | Daily, by 1–3 people | Only renders for coach/owner accounts. Occupies the CREW slot for them. This is the tab the paying customer uses. |

**What gets cut or moved:**

- **`/hud` as a route: split and demoted.** Its behavioural half becomes NOW; its telemetry half becomes PROGRESS. The radar is no longer the first thing you see, because a scoreboard is the worst possible screen for someone deciding whether to skip.
- **`/scanner` and `/home-base`: merged into TRAIN.** Two tabs for "point the camera at the thing you just did."
- **`/brag`: killed as a route, survives as an export sheet inside CREW.** The canvas code stays; the Instagram-story target stops being the primary output.
- **No settings tab, no profile tab.** Long-press the level chip in PROGRESS.

Five tabs, all thumb-reachable on a 6.1" mid-range Android with wet hands. Do not add a sixth member tab. If something needs one, it belongs inside TRAIN.

---

## 2. THE BIG SWING — **THE ROUND ENGINE**

**The phone becomes the gym's sensor by listening, not looking.**

Every product in this market — globally, not just Malaysia — measures combat sport by duration, attendance or step count. MediaPipe at 30fps gives 33ms temporal resolution and *literally skips the contact frame of a jab*. The microphone runs at 44.1kHz: roughly 1,400× finer. An impact sport is an acoustic event stream, and nobody is recording it.

**Mechanism, concretely:**

1. **Capture.** WebAudio `AudioWorkletNode`, mono 44.1kHz, phone face-down on the bench, in a pocket, or (preferred) in a velcro pouch strapped to the bag. Camera off. Screen off. Battery cost is a rounding error next to continuous pose.
2. **Onset detection.** 1024-sample frames, 512 hop. Band-limit 80–2500 Hz (glove-on-bag transient energy; rejects most music bass and most speech formants). Spectral flux → adaptive median threshold over a 1.5s window → peak-pick with a 120ms refractory period.
3. **Per-onset features.** Attack slope, RMS peak, spectral centroid, decay time constant. A ~200-parameter logistic/GBM classifier (trainable on a few hundred hand-labelled onsets from your own gym) buckets each onset: punch / kick / bag sway / clap / music transient / noise.
4. **Round segmentation.** Activity density over 30s windows, hysteresis on entry/exit. No timer input required, though the existing round timer is a free prior.
5. **Outputs — three metrics no member in Malaysia has ever been shown:** strikes per round; **cadence decay slope across rounds** (the actual conditioning number, and the one a coach cannot eyeball); and **left/right rhythm asymmetry** from inter-onset-interval clustering.
6. **Fusion, when the camera is propped.** Audio timestamps contact to the millisecond; pose supplies the kinematics of the three frames *preceding* that timestamp. That combination is the differentiated asset — it is what turns "we do pose estimation" into "we measure strikes."

**Why this is the frontier:** it makes a Muay Thai round objectively measurable with zero hardware, in the dark, in a basement with no signal. It converts the XP economy from dose to performance. It is the input to the Technique Ledger, to Drift Watch, and to any Health Connect emission. And it is the one capability where "no wearable" stops being a constraint and starts being the pitch.

**The hardest technical risk, honestly:** *a combat gym is a room full of people making the identical acoustic event, with music on.* Single-microphone source separation in a reverberant, music-saturated room is a genuinely hard problem, and I will not pretend the DSP above solves it in open plan.

Three mitigations, in order of how much I trust them:

- **Proximity.** Phone in a pouch on *your* bag gives a large SNR advantage over the bag 4m away — inverse-square plus structure-borne vibration. This is the intended deployment, not a fallback.
- **Accelerometer as primary, mic as secondary.** With the phone strapped to the bag, `DeviceMotion` at 60–100Hz makes impact detection nearly unambiguous and completely immune to music and neighbours. Lower temporal resolution, vastly higher reliability. Note the platform tax: iOS gates motion permission and fights AudioWorklet in a PWA — this feature is Android-first and should be stated as such.
- **Confidence gating.** If detected count confidence drops below threshold, report *cadence* (relative, robust) and suppress *count* (absolute, fragile), with a manual round-count fallback.

**Validation gate before any UI is built:** 20 hand-counted rounds, in your actual gym, at normal music volume, with at least two other bags in use. Target ≥95% count accuracy in-pouch and ≥85% pocket-worn. Below 85%, ship it as cadence-only and say so in the product. The category's credibility failure mode — see the NIH/ASN photo-calorie results — is overclaiming a number.

---

## 3. RANKED ROADMAP

Ordered by impact ÷ cost. **WKND** = a solo dev can ship a real v1 in a weekend.

| # | Feature | What it is | Why it wins | Cost | Bold | Depends on | WKND |
|---|---|---|---|---|---|---|---|
| 1 | **TEMPO + shield rework** | Replace the breakable streak integer with a rolling 28-day sessions/week figure that degrades and cannot hit zero. Shields must be *earned* (5th session mints one) and *spent* deliberately with a named reason. Calendar-granted shields auto-arm for Ramadan/Raya/CNY/Deepavali/MC with a proud label. | Kills the app's single largest churn detonator. "3.1/wk, down from 4.0" is reversible; "0" is an identity verdict. Free automatic slack loses the persistence benefit — the cost of spending is the mechanism. | S | 3 | Nothing | ✅ |
| 2 | **THE SLOT** | Sunday: tap three concrete windows (day + time + named coach) against the real timetable. T-90: one tactical line with the friction pre-solved. T-30: graded downgrade (FULL / DOJO 20min / MOBILITY 8min), never binary. On decline, one tap logs *why* from five buttons: kerja / penat / sakit / jam / family. | The only feature that acts on the modal user event — the decision not to go. Implementation intentions are the largest cheap lever in the literature. The decline-reason log becomes the only dataset of its kind in Malaysian fitness. | S–M | 4 | Gym timetable in DB | ✅ |
| 3 | **PAPAN MARKAH** | Weekly 1:1 canvas image + a monospace text block, both pre-sized to survive WhatsApp's renderer, dropped into the gym group every Monday. | WhatsApp is where the gym actually lives. Text gets replied to; images get scrolled past — ship both. Reuses `/brag` canvas code entirely. Single-gym scope is what makes it work and what makes it uncopyable. | S | 3 | Existing canvas | ✅ |
| 4 | **COACHING LADDER** | Per-technique feedback state: ACQUIRE (cue every rep) → BANDWIDTH (cue outside tolerance) → SUMMARY (silent, report after) → SILENT PROBE (no cue, score retention). A technique isn't levelled until you can do it clean with the coach silent. | The AI shutting up on purpose is counterintuitive enough that no competitor will copy it. Slots perfectly into the RPG frame and creates a progression axis that is genuinely novel rather than cosmetic. Scheduling logic over scoring you already have. | S | 5 | Shadow Dojo scoring | ✅ |
| 5 | **COACH CONSOLE** | Days-since-last-session, broken tempo, declining form score, missed slots — with a one-tap Manglish WhatsApp nudge. | This is the product the gym owner buys. Vibefam cannot sell it because it never sees what the athlete did. Retention software is the only viable monetisation given the RM10 AIA anchor. | S–M | 3 | Session data, THE SLOT | — |
| 6 | **REACTIVATION CONTRACT** | Gap ≥10 days: do not render the HUD at all. Render one screen — a 6s clip of *their own* best round from before the lapse — and one button: RESTART AT 60%. Comeback session carries the largest single XP award in the economy. Anchored to the next fresh-start landmark. | Coming back must be worth more than never leaving. Every competitor shows a returner their decay curve, which is the most demoralising possible artefact. | M | 4 | Clip/landmark storage | — |
| 7 | **TECHNIQUE LEDGER** | XP paid for *delta*, not dose: personal-best form score, 90% form at higher cadence than last month, and — the honest skill proxy — **variance reduction** (rep 40 looks like rep 5). | Fixes the plateau failure of a volume-XP curve, and makes the app the only thing in Malaysia that rewards getting *better* rather than showing up. "AIA gave you 0 points tonight. We gave you 340, and here's the frame where your guard dropped." | M | 4 | Shadow Dojo, ideally Round Engine | — |
| 8 | **MACHINE TEMPLATES** | Stick a code on each machine (TM-03, BIKE-05). First member to scan corrects the fields once; geometry + display profile saved gym-wide. Forced torch, "LAP CERMIN" prompt on low contrast, offline queue, confidence-gated correction. | Turns a constraint into a proprietary asset. Within a month the fleet is calibrated by its own members. No global product could ever maintain per-machine templates for one gym in Damansara. | S | 4 | Existing OCR | ✅ |
| 9 | **PUASA PROTOCOL** | App-wide state on the Hijri calendar: XP re-normalised to the fasted-month baseline; tempo re-based to 3×/wk; Dojo rounds capped; Fatigue-vs-Failure swapped for a fasted-state check; session planner anchored to Maghrib/Isyak computed on-device. Plus three fuel blocks (iftar / post-terawih / sahur) with their own targets. | The most under-served moment in the market, it recurs annually forever, and *nobody touches the training side*. This is the single most legible signal the app was built here. | M | 5 | Prayer calc, shield system | — |
| 10 | **THE ROUND ENGINE** | See §2. | The swing. | M–L | 5 | Validation gate first | — |
| 11 | **DRIFT WATCH + CLINIC EXPORT** | Store ~8 per-side kinematic invariants per session (kilobytes of landmark stats, never video). EWMA change-point detection per joint. On drift, never diagnose — surface the trend, pre-queue the corrective, and offer a one-tap export for the physio: 12 weeks of load, the drift chart, the pain timeline, three auto-selected clips, under a "data, not diagnosis" header. | Turns pain from a lagging indicator into a leading one, and resolves the corrective-drill credibility risk by *feeding* the clinician instead of competing with them. **Start logging the invariants now** — the feature ships in three months, but only if the data exists. | M | 5 | Landmark storage from day 1 | — |
| 12 | **VITALITY BRIDGE** | Emit pose/audio-verified sessions to Health Connect as `MARTIAL_ARTS` ExerciseSessions so AIA reads them as auto-captured. | The only feature in the market that would *pay* the member for doing combat sport, which neutralises the RM10 anchor instead of competing with it. | L | 4 | TWA wrapper (Bubblewrap) + native bridge; **and a hard empirical answer on whether AIA accepts third-party sources** | — |

Also worth building, below the line: Corner Cam (fingertip PPG → HRR60 in the compulsory rest interval, a new radar axis that visibly improves), Kongsi Mode + nasi campur modifiers (banjir kuah / separuh-biasa-lebih / drinks as an enum), supplement label scanner, LHDN receipt vault.

---

## 4. KILL LIST

**Kill outright:**

- **The streak counter that can reach zero.** It is a churn detonator wearing a motivation costume. One missed session becomes an abandonment event. Replace with TEMPO.
- **Free, automatic rest shields.** Slack that costs nothing provides no persistence benefit — it is decoration that looks like a feature. Earn them, spend them deliberately, or they do nothing.
- **App-assigned weekly bounties.** Imposed goal + imposed reward is the worst configuration in the motivation literature. Demote to a fallback for people who don't self-declare, and label it visibly as the lesser option. Replace with athlete-authored declarations plus a named witness or a gym-authored forfeit.
- **The Instagram story card as a first-class output.** It reaches the youngest slice of the membership. Keep the canvas; retarget the output.
- **Any "AI-powered" chrome.** The local category is full of unsubstantiated AI claims (Joompa, Vibefam) and one collapsed rented stack (Prudential/Babylon). Say what the sensor did instead.

**Rework, don't delete:**

- **XP and levels.** Keep the level; rewrite the ledger. Paying per session is a volume metric, and volume plateaus around month three — right where retention dies.
- **The 6-axis radar.** Currently a mirror, and self-directed feedback with no task attached is the documented *harmful* case of feedback. Hard rule: **the radar may never render without an attached, bookable next action.** Add a ghost of you eight weeks ago, add the gym median for your level band, and name the shape as a class ("BRAWLER: high power, low gas") so lopsidedness is a build, not a defect.
- **Fatigue vs Failure.** Fine as a data collector, wrong as the whole injury story — it only fires *after* the athlete already hurts. Make it an input to Drift Watch.
- **`/fuel` photo accuracy positioning.** Do not ship an accuracy claim. Independent testing put four leading photo apps at roughly −33% on *Western plated* meals; nasi campur under gravy is strictly worse. Position on **consistency**, which is the only property within-subject inference actually needs — a systematic bias cancels in a per-user model.
- **HUD as the landing route.** Demote to PROGRESS.

---

## 5. MALAYSIA MOAT

**1. The calendar as a training protocol, not a nutrition mode.** Ramadan, Raya balik kampung, CNY, Deepavali, monsoon and haze are deterministic, known years ahead, and each produces a predictable adherence collapse. Only two products in ~50 surveyed show any Ramadan awareness at all, and *neither touches training*. A global app cannot re-normalise its entire scoring layer for 30 days for one country's majority; ClassPass and Fitness First cannot either without rebuilding how they score. Shipping PUASA PROTOCOL — XP re-based, tempo re-based, shields auto-armed, sessions anchored to Maghrib — makes this the only training app in Malaysia that does not punish a fasting Muslim. Add the heat ledger (33°C / 84% RH as a real training variable) and the AQI bounty swap, and the environment becomes measured output instead of invisible difficulty.

**2. One gym, one WhatsApp group, one coach.** Per-machine OCR templates keyed to a sticker on TM-03 in Damansara; a papan markah image with everyone's nickname on it; a coach console with real names and a one-tap Manglish nudge; sparring pair history across a closed population of forty bodies. Every one of these gets *better* because the product serves exactly one gym, and every one is structurally unmaintainable for a global platform. The single-gym constraint is the moat, not the limitation.

**3. Being the only thing that makes a Muay Thai round count.** Malaysia's entire incentive layer — AIA Vitality, PERKESO Activ@Work, KOSPEN@Activ, WeWard, Great Eastern — pays on steps or auto-captured duration, so a 90-minute session scores near zero nationwide, and manual entries earn nothing anywhere. A camera-and-microphone that objectively counts 412 strikes across 47 minutes *is* auto-captured sensor data. Adjacent, same logic: the supplement scanner reads against the JAKIM registry (never asserts halal from a photo — that is a religious-offence risk, not a UX choice), and the LHDN sports relief vault returns real ringgit annually. All three are hooks into Malaysian institutions that a global product has no reason to integrate.

---

## 6. HONEST RISKS

**Technically shaky, in order of how much it matters:**

1. **Acoustic separation in a shared room with music.** The Round Engine's entire value depends on it. Validate before writing UI — 20 hand-counted rounds, real conditions, two other bags active. Prefer the bag-mounted pouch with accelerometer-primary. Android-first; iOS PWA will fight AudioWorklet and motion permissions.
2. **Health Connect from a PWA is impossible.** It needs a TWA wrapper plus a native bridge — the one genuinely non-trivial engineering item on the list. Worse, **whether AIA accepts third-party-written Health Connect sessions as "automatically captured" is unknown**, and that single empirical fact decides whether Vitality Bridge is a headline feature or a footnote. Test it with one consenting member's account before a single word of cashback copy exists.
3. **MediaPipe thermal throttling on mid-range Android in ambient heat.** Measure frame rate at minute 15 of a session, not minute 1, on a Galaxy A / Redmi in the actual gym. Design the fallback (audio-only) as the default for long sessions rather than as a degradation.
4. **PPG heart-rate recovery is unvalidated on the target hardware.** Check against a chest strap on three phones before any number is displayed, and show a confidence interval when it ships.
5. **PDPA and cohort de-anonymisation.** Pose landmarks and audio are body data. On-device by default, explicit consent surface, member-controlled export. A forty-person gym is small enough that any cohort statistic below k≈5 identifies an individual — enforce the floor in code, not in policy.

**Where the corpus contradicts itself — say so out loud rather than picking a side:**

- **Samsung Health food AI.** One source describes an on-device model at 64.1% ID rate with ±26% portion error; another says it has no photo logging at all. Most likely a staged regional rollout. Plan against neither without hands-on testing on a Malaysian-market Galaxy.
- **MyFitnessPal Ramadan support.** Single unverified source claims Suhoor/Iftar-aware logging. If true, the *nutrition* half of the Ramadan play is contested. The *training* half is not, and that is where the differentiation lives anyway.
- **How much `/fuel` matters.** One lens calls photo-to-macros a commodity to be minimised; another argues it is half of a causal pair nobody else holds on one user ID. Both are right: keep it, make it cheap, never compete on accuracy, and let its real payoff be the fuel→output attribution card once ~20 paired records exist.
- **Flagged-but-unverified claims that must not enter UI copy or a pitch until checked:** the current LHDN sports relief amount, Asian BMI cutoffs of 23/27.5, NHMS 2023 prevalence figures, the exact Hijri date of Ramadan 1448, velocity-loss autoregulation thresholds, and the motor-learning citations behind the Coaching Ladder.

**The product risks nobody will flag for you:**

- **The coach console is a surveillance instrument pointed at members.** If a coach uses it to publicly shame someone in the group chat, community trust detonates in a week and no amount of code repairs it. This needs owner training and a norm, not just a feature flag.
- **Twelve individually cheap features is the trap.** The failure mode for a solo dev is ten half-shipped features instead of three that change behaviour. Order matters more than the list. Items 1–4 are the whole first month.
- **Validate the top three with zero code.** Run THE SLOT manually as a Sunday WhatsApp poll for two weeks and count whether anyone answers. Run the COACH CONSOLE by personally messaging drifting members for three weeks and see whether it moves attendance. Ask ten members, out loud, whether they will let the gym store their pose data. If those three answers are no, the roadmap is wrong and you have lost a fortnight instead of a quarter.