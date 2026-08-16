# Hybrid Combative HUD — Creative Handoff

**For: Google Gemini**
**From: the engineering side**
**Purpose: expand and pressure-test the product direction. Be creative, but inside the constraints in §6 — several of them exist because we already got them wrong once.**

---

## 1. What this is

A live, deployed Progressive Web App for **one gym**: Hybrid Combative, in Damansara, Malaysia.

The gym is a **hybrid**: Muay Thai and BJJ classes on the mats, plus an open weights floor and cardio machines used by general members who never take a class. Some members are fighters. Most are not. The app has to serve both without either feeling like an afterthought.

**The gym's commercial goal is physical attendance.** Not app engagement, not step counts. Bodies through the door, onto the mats, and using the facility they already pay for. Every feature should be judged against that.

Stack: Next.js 14 (App Router) · Supabase (Postgres + RLS + magic-link auth) · Netlify · Claude vision API · MediaPipe on-device pose · Web Push. Installable PWA.

Design direction: **industrial brutalism.** Dark only, zero border radius, hard hairline rules, hazard chevrons, monospace for data and Inter for prose, one accent gold and one hazard red. It is deliberately not a rounded pastel wellness app.

---

## 2. The five tabs, and why each exists

### NOW — the pre-decision surface

The only screen that exists *before* someone decides whether to train.

- **THE SLOT.** A member declares intent to attend a specific timetabled class. Not a booking — a commitment to themselves. At T-90 and T-30 a push notification arrives.
- **The graded downgrade.** If they can't face the full session, the app offers a smaller one (20-minute home drill, 8-minute mobility) rather than a binary yes/no. A binary choice is how one bad evening becomes a lapsed month.
- **The decline-reason log.** If it didn't happen, one tap says why: `kerja` (work), `penat` (tired), `sakit` (hurt/unwell), `jam` (traffic), `family`. No lecture attached to the answer.
- **TEMPO.** A rolling 28-day sessions-per-week figure with bands (DORMANT → SPORADIC → BUILDING → CONSISTENT → SHARP → RELENTLESS). It replaced a streak counter. **See §5 — this decision appears to have been wrong.**
- **Rest shields.** Minted every 5th session, spent deliberately with a stated reason, protect a gap.
- **Offers.** Class recommendations, with a hard guardrail described in §6.

### TRAIN — plan it, or record it

One tab, two entry points, because they are one flow and not two features.

- **Plan:** pick from **14 focus days** (leg, back, chest, shoulder, arm, core, glute, calf, push, pull, full body, conditioning, kickboxing, grappling) → a **muscle-group-specific prep checklist** (12 protocols; ankle rocks before squats, band pull-aparts before pressing) → the exercise list drawn from **59 exercises**, compounds first, one movement per pattern.
- **Log:** three taps — what, how long, how hard.
- Planning **hands off** to logging. The plan decides *what*; only the member knows *how long and how hard*.
- **Session load = duration × RPE** (Foster's session-RPE). This is the app's universal currency. A 45-minute heavy lift and a 60-minute grappling round are commensurable. There is deliberately **no per-modality multiplier** — the moment COMBAT is worth 1.2× a spin class, the app is telling half the membership their training counts less.
- Every exercise declares whether it needs the gym floor, and the planner **prefers the ones that do**. That bias is commercial and it is documented in the source rather than hidden.

### FUEL — nutrition

- Log a meal by **photo** (Claude vision) **or by voice**. Voice exists because portion — not food identification — is the dominant error in photo-based estimation, and spoken portions measurably beat visual ones. The prompt asks *"how much?"*, never *"describe your meal."*
- Macro targets from Mifflin-St Jeor plus an activity factor derived from **actually logged sessions**.
- **The interaction screen.** 19 rules mapping declared medical conditions to food and movement. Declare acid reflux and the coach line suggests lime → it flags. Declare an ACL tear and a squat drill flags. It never diagnoses, never prescribes, always defers to a professional. **No row is clinically reviewed and every row says so.**

### FORM — on-device movement check

- MediaPipe pose, **5 drills**, all processing on the phone. No frames leave the device.
- A **coaching ladder** that progressively *withdraws* live feedback as competence holds — the guidance hypothesis from motor learning. At the top rung both the cues and the score are hidden, because a visible number is itself feedback.
- Skeleton overlay, muscle map, corrective prescriptions.
- **Known limitation:** a motionless person scores near 100, so a genuinely poor rep can too. Treat output as indicative.

### STATS — the weekly ritual

Level and XP, a six-axis radar (**craft, engine, strength, power, recovery, discipline**), bounties, and a collapsed combat log. Reference material, not a daily surface.

---

## 3. What the market scan found

Ten apps studied: Fitness First SEA, TeamUp, Equinox, F45, Crunch, Mindbody, ClassPass, Zen Planner/Kicksite, Strava, Duolingo.

### Mechanics worth stealing

| Source | Mechanic |
|---|---|
| **TeamUp** | **Nightly blackout.** The waitlist expiry clock and cancellation cutoff both freeze overnight. A 3-hour cutoff on an 8am class means cancelling by 9pm, not 5am. The single smartest thing found. |
| **TeamUp** | Two-threshold waitlist: >1 day out, auto-enrol silently; inside 1 day, hold the spot for that person for 30 min, then pass it down. |
| **Equinox** | *"Receipt of a notification does not reserve a spot."* Claim-required, never auto-assign. |
| **Crunch** | At T-5 minutes, unclaimed reservations dissolve and the room becomes walk-in. Zero admin, converts a no-show into someone else's opportunity. |
| **F45** | Cancellation deadlines are a *function of class time*, not a constant. Nobody is awake at 21:00 to cancel a 06:00 class. |
| **Fitness First** | Penalty is **withdrawal of booking privilege, never cash** — and you can still walk in and take a spot if one is free. |
| **Mindbody** | Two capacity numbers: room capacity, and how many of those seats app booking may consume. The rest are held for walk-ins. |

### Malaysia-specific

Cash fines are the wrong instrument here. After the True Fitness collapse (90 NCCC complaints, RM348,911 in member losses), a gym app that charges a penalty reads as theft-adjacent. **Privilege withdrawal is the only viable penalty currency.**

WhatsApp is the default gym communications channel, not email and not in-app messaging.

---

## 4. Where this app is genuinely ahead

Four claims survived scrutiny:

1. **The decline-reason log has zero competition.** Four independent scans found nothing comparable. Every other platform has one bucket called "no-show". This is the only dataset in the market that separates *"this member is disengaging"* from *"the traffic beat them again"*. A product manager in Austin does not invent `jam` as a first-class category.

2. **The load veto is a moat made of incentive structure.** The app silences *all* commercial recommendations when the training-load model says a member is overreaching. No incumbent can copy this: a vendor earning per-booking or per-check-in cannot ship a feature that says "buy nothing this week."

3. **The coaching ladder is a category absence.** Every martial-arts "curriculum" feature in the market is a rank-keyed video library. Nothing measures the member's own movement, so nothing can withdraw feedback as competence grows. "42 classes at white belt" is an attendance signal; this is a competence signal.

4. **sRPE as a cross-modality currency.** Attendance is a boolean check-in everywhere else. Nobody quantifies the session. This is exactly the hybrid gym's core problem and a pure martial-arts school never had to solve it.

---

## 5. Where it is behind — ranked

1. **No capacity model at all.** No class has a size. This blocks partner matching, rosters, waitlists, release cascades and any honest occupancy forecast. Highest-leverage missing primitive in the product.
2. **No member-to-member visibility.** Every database policy is strictly own-row. This forfeits the only social mechanic with clean causal evidence for *physical* attendance: **co-attendance**. Babcock et al. (2020) found large spillovers between best friends who train together, and none between mere acquaintances. The mechanism is literally *going to the gym with someone*. **Do not build a feed. Build co-declaration.**
3. **No coach role and no coach view.** Every output routes to one member's private phone. For a gym this size, a coach noticing you missed twice is worth more than any formula in the codebase.
4. **No payments, wallet, QR entry, or access control.** The app cannot take money and cannot let anyone in.

---

## 6. Constraints Gemini must respect

These are not preferences. Several exist because we already got them wrong.

**The load veto is not negotiable without an argument.** When the model says a member is ramping too fast or grinding at high monotony, *every* commercial recommendation is silenced — not down-ranked. If you propose something that overrides it, you must argue explicitly why it isn't load. (We already ruled one such case: a free drink is not training volume, so it survives the veto; an invitation to "come do Open Gym" does not.)

**Medical and safety copy may be tightened, never removed or made less prominent.** The interaction screen defers outward. It never diagnoses.

**Never invent evidence.** See §7. Numbers without a real citation have already cost this project one wrong architectural decision.

**Keep the brutalist identity.** The problem was never that it was industrial; it was that it was unreadable. Prose is now Inter at 15px; mono is for data. Hazard red means danger only — a full class is not a danger.

**Don't make it a feed.** Distributed social engagement is unproven for facility visits. Co-attendance is proven.

**Malaysia is not a skin.** Ramadan, Raya, CNY and Deepavali windows already ship. Manglish code-switching is handled in the voice transcription vocabulary. WhatsApp is the real channel.

---

## 7. The thing we got wrong, and want you to reason from

TEMPO replaced a streak counter. The stated reason, in the source:

> *"A streak that can hit zero is a churn detonator: one missed session turns a number into an identity verdict, and the app gets deleted."*

**The market scan could not find evidence for that claim, and found evidence against it.**

- The two statistics that dominate the "streaks are harmful" corpus — *"63% more likely to abandon habits after missing one day"* and *"47% more likely to binge"* — have **no author, no title, no journal, no DOI anywhere.** They exist only in habit-app content marketing, propagating between AI-written blog posts.
- The one direct empirical test (PLOS ONE, 2025) interviewed runners who had broken streaks of 100+ days. They felt sadness and relief — and **all who were physically capable resumed running.** Verdict: *"small backfire potential."*
- Silverman & Barasch (Journal of Consumer Research, 2023), across seven studies: an **intact streak increases subsequent engagement independent of actual past behaviour** — the effect depends purely on how the behaviour is *represented*. The same paper names both mitigations: damage is attenuated when the streak can be **repaired**, and amplified when the break is attributed **internally**.

Which produces the sharpest line in the whole report:

> **We built rest shields (repair) and the decline-reason log (external attribution) — the exact two mitigations the literature calls for — and then deleted the thing they were protecting.**

**This is where we most want your thinking.** Not "add streaks back". The interesting question is what a *repairable, externally-attributable* commitment metric looks like when you already have shields and a reason log, and when the goal is a physical building rather than a daily app open.

---

## 8. Open questions — push hardest here

1. **Getting a member from "app open" to "through the door".** Everything above measures training. Almost nothing shortens the distance to the building. What mechanics actually move that, given push notifications, a real timetable, and a gym with an open floor?

2. **The 20-person BJJ mat.** Strict capacity, FIFO waitlist, 15-minute claim window on a released spot. What is the *emotional* design of being #3 on a waitlist? The member who does **not** get the spot is the one most likely to disengage, and that state matters more than the winner's.

3. **Beverages.** The gym has a fridge (100 Plus, water). Micro-transactions are unbuilt. Is a free drink a good pivot when a class is full — or does it teach members to waitlist classes they never intended to attend?

4. **Co-attendance without a feed.** Given the evidence that only close-friend co-attendance moves physical visits, and that in one dataset less-active members influenced more-active ones but **not** the reverse, and men did not influence women at all — what is the safe, useful shape of social here?

5. **The hybrid tension.** A fighter and a 45-year-old doing spin class share one app. Where should they diverge, and where must they stay in the same system?

6. **What should be deleted?** There is a WhatsApp scoreboard module written and never wired up. The pose scoring has a validity problem. Not every built thing deserves to survive.

---

## 9. How to give us useful output

- Concrete beats visionary. "A card on NOW that shows which two classmates have also declared Thursday's BJJ" is usable; "leverage social dynamics" is not.
- Say what you'd **cut**, not only what you'd add.
- If you disagree with a constraint in §6, argue it directly — but engage with the reason given.
- Weight every idea by: *does this get one more person through the door this week?*
- Flag anything that needs evidence we do not have, rather than asserting a number.
