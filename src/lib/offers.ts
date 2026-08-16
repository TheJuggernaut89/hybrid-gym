/**
 * OFFERS — class recommendations that happen to sell class packs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RULE THIS FILE EXISTS TO ENFORCE
 *
 * Recommend on CAPABILITY GAP or INTEREST. Never on inadequacy, appearance,
 * or health fear. "You have not trained power in five weeks" is coaching.
 * "You are falling behind" is a different product, and it is the one that
 * makes people delete fitness apps.
 *
 * And the hard constraint: when the load model says this member is ramping too
 * fast or grinding the same intensity every day, the commercial layer is
 * SILENCED. `LoadState.vetoUpsell` is honoured unconditionally in `buildOffers`
 * — not as a ranking penalty that a high-scoring offer can out-argue.
 *
 * The gym sells class packs and tier upgrades. That is a fortunate business
 * model here: selling more classes to a member who would genuinely benefit from
 * more classes is aligned. There is no supplement to push against a calorie
 * target, so the conflict of interest that usually poisons this layer does not
 * arise — provided nothing here ever starts recommending food.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { LoadState } from './session';
import type { StatKey } from './types';

export type OfferKind =
  | 'modality_gap'
  | 'plateau'
  | 'schedule_mismatch'
  | 'tier_upgrade'
  | 'variety_risk';

export interface Offer {
  kind: OfferKind;
  /** Headline. States the observation, not a verdict on the person. */
  headline: string;
  /** Why this is being shown — always the evidence, never flattery or fear. */
  because: string;
  /** What the member can do. */
  action: string;
  /** 0-100. Higher = better matched, not more profitable. */
  score: number;
  /** True when acting on this costs money. Surfaced honestly in the UI. */
  paid: boolean;
}

export interface OfferInput {
  load: LoadState;
  /** Share of trailing load per quality, from modalityMix(). */
  mix: Record<string, number>;
  /** Sessions per week, from TEMPO. */
  tempo: number;
  /** Classes included in the member's current tier, per week. Null = unlimited. */
  classesIncluded: number | null;
  /** Classes actually attended in the trailing 7 days. */
  classesUsed: number;
  /** Decline reasons logged against slots in the trailing 28 days. */
  declineReasons: string[];
  /** Qualities with no coached class available — never recommend these. */
  unavailable?: StatKey[];
}

const QUALITY_LABEL: Record<string, string> = {
  craft: 'CRAFT',
  engine: 'ENGINE',
  strength: 'STRENGTH',
  power: 'POWER',
  recovery: 'RECOVERY',
};

/**
 * Qualities worth recommending a class for. RECOVERY is excluded from
 * gap-based selling on purpose: telling someone to buy a mobility class
 * because they have not done mobility is the thin end of manufactured need.
 */
const SELLABLE: StatKey[] = ['craft', 'engine', 'strength', 'power'];

/** A quality is "untouched" below this share of trailing load. */
const GAP_THRESHOLD = 0.1;

export function buildOffers(input: OfferInput): Offer[] {
  // ── the veto ───────────────────────────────────────────────────────────
  // Unconditional and first. Not a score adjustment — a hard stop. A member
  // who is ramping or grinding does not need to be sold more training, and an
  // app that sells it anyway will hurt them and then lose them.
  if (input.load.vetoUpsell) return [];

  const offers: Offer[] = [];
  const unavailable = new Set(input.unavailable ?? []);

  // ── 1. modality gap ────────────────────────────────────────────────────
  // Only meaningful once there is enough history for "untouched" to mean
  // something rather than "new member".
  // ONE gap offer, for the single biggest gap — never one per quality.
  // A member training only cardio has three untrained qualities, and listing
  // all three reads as "you are bad at everything", which is precisely the
  // inadequacy framing this file exists to avoid. A coach names the one thing
  // worth adding next.
  if (input.load.chronic >= 400) {
    const gaps = SELLABLE.filter((q) => !unavailable.has(q))
      .map((q) => ({ q, share: input.mix[q] ?? 0 }))
      .filter((g) => g.share < GAP_THRESHOLD)
      .sort((a, b) => a.share - b.share);

    const worst = gaps[0];
    if (worst) {
      const label = QUALITY_LABEL[worst.q];
      offers.push({
        kind: 'modality_gap',
        headline: `${label} is untrained`,
        because:
          worst.share === 0
            ? `Nothing in your last four weeks developed ${label.toLowerCase()}.`
            : `Only ${Math.round(worst.share * 100)}% of your recent work developed ${label.toLowerCase()}.`,
        action: `Book a ${label.toLowerCase()} class`,
        // A total absence scores above a thin slice.
        score: worst.share === 0 ? 82 : 68,
        paid: true,
      });
    }
  }

  // ── 2. variety risk ────────────────────────────────────────────────────
  // Training hard but narrowly. This is a genuine injury-risk pattern, and it
  // is also the case where a second modality is the honest recommendation.
  const topShare = Math.max(0, ...Object.values(input.mix));
  if (input.tempo >= 4 && topShare >= 0.8) {
    offers.push({
      kind: 'variety_risk',
      headline: 'Training hard, training narrow',
      because: `${Math.round(topShare * 100)}% of your load is one kind of work, at ${input.tempo.toFixed(1)} sessions a week.`,
      action: 'Add one different session a week',
      score: 76,
      paid: true,
    });
  }

  // ── 3. schedule mismatch ───────────────────────────────────────────────
  // Repeatedly declining the same slot for the same reason is not a
  // motivation problem, it is a timetable problem. This one sells nothing —
  // it exists because the honest answer is sometimes "move your booking".
  const reasonCounts = input.declineReasons.reduce<Record<string, number>>((acc, r) => {
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
  const [topReason, topCount] = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (topReason && topCount >= 3) {
    const why: Record<string, string> = {
      kerja: 'work keeps overrunning',
      jam: 'traffic keeps beating you',
      penat: 'you keep arriving spent',
      sakit: 'you have been unwell',
      family: 'family commitments keep landing',
      penuh: 'the class was full when you got there',
    };

    // `penuh` is the gym's fault, not the member's. Left unmapped it fell
    // through to "you have declined it 3 times because of the same reason →
    // move to a different time", which blames someone who turned up and was
    // sent home. Same data, opposite subject.
    const gymSide = topReason === 'penuh';
    offers.push({
      kind: 'schedule_mismatch',
      headline: gymSide ? 'That class keeps filling up' : 'This slot is not working',
      because: gymSide
        ? `You have been turned away ${topCount} times because ${why[topReason]}.`
        : `You have declined it ${topCount} times because ${why[topReason] ?? 'of the same reason'}.`,
      action: gymSide ? 'Find a quieter session' : 'Move to a different time',
      score: 88,
      paid: false,
    });
  }

  // ── 4. tier upgrade ────────────────────────────────────────────────────
  // Only when they have actually run out. Never as a pre-emptive nudge.
  if (
    input.classesIncluded !== null &&
    input.classesIncluded > 0 &&
    input.classesUsed >= input.classesIncluded
  ) {
    offers.push({
      kind: 'tier_upgrade',
      headline: 'You have used every class in your tier',
      because: `${input.classesUsed} of ${input.classesIncluded} used this week.`,
      action: 'See tier options',
      score: 72,
      paid: true,
    });
  }

  // Highest-matched first, and free advice outranks a paid offer at equal
  // score so the app is not quietly ordered by revenue.
  return offers
    .sort((a, b) => b.score - a.score || Number(a.paid) - Number(b.paid))
    .slice(0, 2); // Two at most. A wall of offers is an ad break.
}

/**
 * What to show instead when the veto is active.
 *
 * The member still gets guidance — they just get the guidance that is true,
 * which is to back off rather than buy.
 */
export function vetoAdvice(load: LoadState): string | null {
  if (!load.vetoUpsell) return null;
  return load.flag === 'monotonous'
    ? 'Nothing to add this week. Same intensity every day — take one properly easy session before anything else.'
    : 'Nothing to add this week. You are already well above your recent baseline — let it settle.';
}
