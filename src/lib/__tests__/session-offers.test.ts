/**
 * session load and offers
 *
 * Ported from the throwaway Node harness used during the build. These run
 * against src/lib directly, so they fail if the logic drifts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { sessionLoad, xpFromSession, clampRpe, anchorFor, computeLoad, dailyLoads, modalityMix, SESSION_TYPES, sessionTypeFor, } from '../session';
import { buildOffers, vetoAdvice } from '../offers';

test("session load and offers", () => {
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

const DAY = 86400000;
const NOW = new Date('2026-08-15T12:00:00Z');
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString();

/* ── the load unit ────────────────────────────────────────────────────── */
eq(sessionLoad(60, 7), 420, '60min @ RPE7 = 420 AU');
eq(sessionLoad(30, 4), 120, '30min @ RPE4 = 120 AU');
eq(xpFromSession(45, 8), 360, 'XP is the load, no modality multiplier');

// The whole point: modality-blind. Equal duration and effort, equal reward.
eq(sessionLoad(60, 7), xpFromSession(60, 7), 'a class and a lift score identically');

// The old formula gave 30min/300kcal treadmill 510 XP and a 60min class 0.
ok(sessionLoad(60, 7) > sessionLoad(30, 4),
  'a hard hour now outscores an easy half hour — the inversion is fixed');

eq(clampRpe(0), 1, 'RPE clamps low');
eq(clampRpe(99), 10, 'RPE clamps high');
eq(clampRpe(NaN), 1, 'NaN RPE is safe');
eq(sessionLoad(9999, 10), 3000, 'absurd durations are capped');
eq(sessionLoad(-5, 5), 0, 'negative duration floors at zero');
eq(anchorFor(8).word, 'HARD', 'RPE 8 reads as HARD');
eq(anchorFor(1).word, 'EASY', 'below the first anchor still resolves');

/* ── modality taxonomy covers a whole gym floor ───────────────────────── */
const ids = SESSION_TYPES.map((t) => t.id);
for (const need of ['lift', 'conditioning', 'class', 'combat', 'mobility']) {
  ok(ids.includes(need), `${need} is loggable`);
}
eq(new Set(ids).size, ids.length, 'no duplicate session types');
eq(sessionTypeFor('lift').stat, 'strength', 'lifting feeds strength');
eq(sessionTypeFor('combat').stat, 'craft', 'combat feeds craft, not a bespoke axis');
eq(sessionTypeFor('nope'), null, 'unknown type resolves to null');
ok(SESSION_TYPES.every((t) => t.defaultMin > 0), 'every type has a usable default');

/* ── load state ───────────────────────────────────────────────────────── */
eq(dailyLoads([], 7, NOW).length, 7, 'seven buckets for seven days');

// Steady, sane training: ~3 sessions/wk at moderate load, four weeks deep.
const steady = [];
for (let d = 0; d < 28; d++) if (d % 2 === 0) steady.push({ created_at: ago(d), load: 300 });
const s = computeLoad(steady, NOW);
ok(s.acute > 0 && s.chronic > 0, 'steady history produces both windows');
eq(s.vetoUpsell, false, 'steady training does not trigger the veto');

// A brand-new member must not be labelled as spiking.
const fresh = computeLoad([{ created_at: ago(0), load: 400 }], NOW);
eq(fresh.ratio, null, 'no ratio without a real chronic base');
eq(fresh.vetoUpsell, false, 'a first session is not a red flag');

// Nothing logged in a week, but history exists.
const stale = computeLoad(
  Array.from({ length: 10 }, (_, i) => ({ created_at: ago(8 + i * 2), load: 350 })),
  NOW,
);
eq(stale.flag, 'detraining', 'a silent week reads as detraining');
eq(stale.vetoUpsell, false, 'detraining does not block a recommendation');

// Monotony: identical hard load every single day, no easy days.
// ZERO VARIANCE IS THE WORST CASE, NOT AN UNDEFINED ONE. A naive `sd > 0`
// guard returns null here and silently disables the check exactly when it
// should fire hardest. This asserts it fires.
const grind = Array.from({ length: 28 }, (_, d) => ({ created_at: ago(d), load: 400 }));
const g = computeLoad(grind, NOW);
ok(g.monotony !== null, 'zero daily variance is NOT treated as unknown');
eq(g.monotony, 5, 'perfect monotony pins to the cap rather than dividing by zero');
eq(g.flag, 'monotonous', 'and is flagged as monotonous');
eq(g.vetoUpsell, true, 'grinding the same load daily trips the veto');

// A single session in a week is the OPPOSITE of monotonous — plenty of rest.
const sparse = computeLoad([{ created_at: ago(1), load: 400 },
  ...Array.from({ length: 12 }, (_, i) => ({ created_at: ago(9 + i * 1.5), load: 300 }))], NOW);
ok(sparse.monotony === null || sparse.monotony < 2,
  'one session amid rest days is not flagged monotonous');

// Low but perfectly regular load (a daily walk) must not trip the veto —
// the absolute-load gate is what stops the cap from over-firing.
const walker = Array.from({ length: 28 }, (_, d) => ({ created_at: ago(d), load: 20 }));
const w = computeLoad(walker, NOW);
eq(w.monotony, 5, 'a daily walk is still perfectly monotonous...');
eq(w.vetoUpsell, false, '...but too light to warrant blocking anything');

// Ramp: a quiet month then a huge week.
const ramp = [
  ...Array.from({ length: 8 }, (_, i) => ({ created_at: ago(10 + i * 2), load: 200 })),
  ...Array.from({ length: 6 }, (_, i) => ({ created_at: ago(i), load: 700 })),
];
const r = computeLoad(ramp, NOW);
ok(r.ratio !== null && r.ratio > 1.3, 'a spike is detected');
eq(r.vetoUpsell, true, 'a sharp spike trips the veto');

/* ── modality mix ─────────────────────────────────────────────────────── */
const mix = modalityMix([
  { stat: 'engine', load: 800 },
  { stat: 'engine', load: 200 },
  { stat: 'strength', load: 0 },
]);
eq(mix.engine, 1, 'all load in one quality reads as 100%');
eq(modalityMix([]).engine, undefined, 'empty history has no mix');

/* ── offers: the veto is absolute ─────────────────────────────────────── */
const base = {
  load: { ...s, chronic: 1200, vetoUpsell: false, flag: 'steady' },
  mix: { engine: 1.0 },
  tempo: 4.5,
  classesIncluded: 2,
  classesUsed: 5,
  declineReasons: ['kerja', 'kerja', 'kerja'],
};

const normal = buildOffers(base);
ok(normal.length > 0, 'a well-matched member gets recommendations');
ok(normal.length <= 2, 'never more than two offers — this is not an ad break');

// Same member, every commercial signal screaming, but load says back off.
const vetoed = buildOffers({ ...base, load: { ...base.load, vetoUpsell: true, flag: 'monotonous' } });
eq(vetoed.length, 0,
  'the veto silences EVERY offer, even with maximum commercial signal');
ok(vetoAdvice({ ...base.load, vetoUpsell: true, flag: 'monotonous' }).includes('easy'),
  'and the member is told to back off instead');
eq(vetoAdvice(base.load), null, 'no veto advice when not vetoed');

/* ── offers recommend on evidence, not inadequacy ─────────────────────── */
const gapOffers = buildOffers({
  ...base, mix: { engine: 1.0 }, declineReasons: [], classesUsed: 0, tempo: 3,
});
const gap = gapOffers.find((o) => o.kind === 'modality_gap');
ok(gap, 'an untrained quality produces a gap offer');
// Cardio-only training leaves craft, strength AND power untrained. Listing all
// three reads as "you are bad at everything" — name one thing to add.
eq(gapOffers.filter((o) => o.kind === 'modality_gap').length, 1,
  'only ONE gap offer, however many qualities are untrained');
ok(/untrained|Nothing in your last/.test(gap.headline + gap.because),
  'stated as an observation about training, not about the person');
for (const o of gapOffers) {
  ok(!/fat|weak|behind|failing|lazy|should be/i.test(o.headline + o.because),
    'no shaming language anywhere in the offer copy');
}

// RECOVERY is never sold as a gap.
ok(!buildOffers({ ...base, mix: { engine: 1.0 }, declineReasons: [], classesUsed: 0 })
  .some((o) => o.kind === 'modality_gap' && /RECOVERY/.test(o.headline)),
  'recovery is never turned into manufactured need');

// A new member is not gap-sold before there is history to judge.
eq(buildOffers({ ...base, load: { ...base.load, chronic: 50 }, declineReasons: [], classesUsed: 0 })
  .filter((o) => o.kind === 'modality_gap').length, 0,
  'no gap offers without a real training history');

// Tier upgrade only once they have actually run out. Use a balanced, moderate
// member so gap/variety offers do not legitimately outrank it — the two-offer
// cap means better-matched coaching correctly wins a contested slot.
const balanced = {
  ...base,
  mix: { engine: 0.3, strength: 0.3, craft: 0.2, power: 0.2 },
  tempo: 3,
  declineReasons: [],
};
ok(buildOffers({ ...balanced, classesUsed: 5, classesIncluded: 2 })
  .some((o) => o.kind === 'tier_upgrade'), 'upgrade offered when the tier is exhausted');
ok(!buildOffers({ ...balanced, classesUsed: 1, classesIncluded: 5 })
  .some((o) => o.kind === 'tier_upgrade'), 'no pre-emptive upgrade nudge');
ok(!buildOffers({ ...balanced, classesIncluded: null, classesUsed: 99 })
  .some((o) => o.kind === 'tier_upgrade'), 'unlimited tiers are never upsold');
// A balanced member training moderately should not be sold anything at all.
eq(buildOffers({ ...balanced, classesUsed: 1, classesIncluded: 5 }).length, 0,
  'a well-rounded member on a sane schedule gets NO offers');

// The free, revenue-negative offer outranks paid ones — ordering is not by money.
const sched = buildOffers({ ...base, declineReasons: ['kerja', 'kerja', 'kerja', 'kerja'] });
eq(sched[0].kind, 'schedule_mismatch', 'the honest free fix ranks first');
eq(sched[0].paid, false, 'and it is marked as costing nothing');

// Never recommend a class the gym does not run.
ok(!buildOffers({ ...base, declineReasons: [], classesUsed: 0, mix: { engine: 1.0 }, unavailable: ['power', 'craft', 'strength'] })
  .some((o) => o.kind === 'modality_gap'),
  'unavailable qualities are never recommended');
});
