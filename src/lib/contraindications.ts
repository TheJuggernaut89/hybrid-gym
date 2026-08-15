/**
 * CONTRAINDICATION SCREEN
 *
 * The problem this exists to stop: the fighter declares acid reflux at
 * induction, then the nutrition coach cheerfully tells them to add lime, or the
 * macro target hands a CKD patient 2.0 g/kg of protein. The app caused that. It
 * is not a knowledge gap — it is a duty-of-care failure.
 *
 * So this layer screens the app's OWN OUTPUT against what the fighter told us,
 * before that output is ever displayed. That includes LLM-generated coach
 * comments, which are the least predictable surface in the product.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 *
 * It is not a diagnosis, not a treatment recommendation, and not a clinical
 * database. It never says "you have X" and never proposes a remedy — it says
 * "you declared X, this is commonly known to aggravate it, raise it with a
 * professional." Every rule defers outward rather than prescribing.
 *
 * Every entry carries `evidence` and `source`. Only `established` entries are
 * surfaced by default (see `screen`). Nothing here has been reviewed by a
 * clinician; `reviewed: false` is accurate on every row and must stay that way
 * until someone qualified signs the table off for this gym.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Severity = 'avoid' | 'caution' | 'monitor';

/**
 * `established` — widely documented, uncontroversial, in standard dietary guidance.
 * `common`      — frequently reported, individually variable.
 * `theoretical` — mechanistically plausible, weak direct evidence. Never surfaced.
 */
export type Evidence = 'established' | 'common' | 'theoretical';

export type TriggerKind = 'food' | 'supplement' | 'macro' | 'timing' | 'training';

export interface Interaction {
  id: string;
  /** Matched against the fighter's declared conditions. */
  conditionMatch: string[];
  conditionLabel: string;
  kind: TriggerKind;
  /** Matched against dish names, item lists, supplement names or macro keys. */
  triggerMatch: string[];
  triggerLabel: string;
  severity: Severity;
  evidence: Evidence;
  /** Plain language, non-diagnostic, defers outward. */
  note: string;
  /** Basis for the entry. Not a citation — a pointer for whoever reviews this. */
  source: string;
  /** True only once a qualified person has signed this row off. */
  reviewed: boolean;
}

/**
 * Deliberately small. A short table of things that are genuinely well
 * established beats a long one padded from memory — and a wrong row here is
 * worse than a missing one, because the fighter will trust it.
 */
export const INTERACTIONS: Interaction[] = [
  // ── reflux / GERD ───────────────────────────────────────────────────────
  {
    id: 'gerd-acidic',
    conditionMatch: ['reflux', 'gerd', 'heartburn', 'gastritis', 'ulcer'],
    conditionLabel: 'Acid reflux',
    kind: 'food',
    triggerMatch: ['lime', 'lemon', 'citrus', 'orange', 'vinegar', 'tomato', 'asam', 'tamarind', 'cuka'],
    triggerLabel: 'Acidic foods',
    severity: 'caution',
    evidence: 'established',
    note: 'Acidic foods commonly aggravate reflux. You declared reflux at induction — worth raising with a doctor or dietitian before making this routine.',
    source: 'Standard dietary guidance for GERD; commonly listed trigger category.',
    reviewed: false,
  },
  {
    id: 'gerd-spicy',
    conditionMatch: ['reflux', 'gerd', 'heartburn', 'gastritis', 'ulcer'],
    conditionLabel: 'Acid reflux',
    kind: 'food',
    triggerMatch: ['sambal', 'chilli', 'chili', 'spicy', 'pedas', 'cili', 'curry', 'kari'],
    triggerLabel: 'Spicy food',
    severity: 'caution',
    evidence: 'established',
    note: 'Spicy food is a commonly reported reflux trigger. You declared reflux — a professional can tell you whether it applies to you.',
    source: 'Standard dietary guidance for GERD.',
    reviewed: false,
  },
  {
    id: 'gerd-caffeine',
    conditionMatch: ['reflux', 'gerd', 'heartburn', 'gastritis'],
    conditionLabel: 'Acid reflux',
    kind: 'food',
    triggerMatch: ['coffee', 'kopi', 'espresso', 'caffeine', 'pre-workout', 'preworkout', 'energy drink'],
    triggerLabel: 'Caffeine',
    severity: 'caution',
    evidence: 'established',
    note: 'Caffeine is a commonly reported reflux trigger, and pre-workout is usually a large dose of it.',
    source: 'Standard dietary guidance for GERD.',
    reviewed: false,
  },
  {
    id: 'gerd-late-meal',
    conditionMatch: ['reflux', 'gerd', 'heartburn'],
    conditionLabel: 'Acid reflux',
    kind: 'timing',
    triggerMatch: ['late_meal'],
    triggerLabel: 'Eating close to lying down',
    severity: 'caution',
    evidence: 'established',
    note: 'Large meals shortly before lying down are a well-documented reflux trigger. Training late and eating after often collides with this.',
    source: 'Standard dietary guidance for GERD (meal timing).',
    reviewed: false,
  },

  // ── hypertension ────────────────────────────────────────────────────────
  {
    id: 'htn-sodium',
    conditionMatch: ['hypertension', 'high blood pressure', 'darah tinggi'],
    conditionLabel: 'Hypertension',
    kind: 'food',
    // Dried salted anchovies and keropok belong here on the merits: they are
    // among the highest-sodium items in everyday Malaysian cooking.
    triggerMatch: ['instant noodle', 'maggi', 'processed', 'canned', 'salted', 'ikan masin', 'ikan bilis', 'anchovies', 'keropok', 'belacan', 'soy sauce', 'kicap', 'msg'],
    triggerLabel: 'High-sodium foods',
    severity: 'caution',
    evidence: 'established',
    note: 'Sodium intake is directly relevant to blood pressure management. You declared hypertension — your doctor will have a target for you.',
    source: 'Standard dietary guidance for hypertension.',
    reviewed: false,
  },
  {
    id: 'htn-stimulant',
    conditionMatch: ['hypertension', 'high blood pressure', 'darah tinggi', 'heart', 'arrhythmia', 'palpitation'],
    conditionLabel: 'Hypertension / cardiac',
    kind: 'supplement',
    triggerMatch: ['pre-workout', 'preworkout', 'fat burner', 'thermogenic', 'ephedrine', 'yohimbine', 'synephrine', 'high caffeine'],
    triggerLabel: 'Stimulant supplements',
    severity: 'avoid',
    evidence: 'established',
    note: 'Stimulant pre-workouts and fat burners raise heart rate and blood pressure. With a declared cardiovascular condition this needs a doctor’s view before use, not an app’s.',
    source: 'Standard cautions on sympathomimetic supplements.',
    reviewed: false,
  },

  // ── kidney ──────────────────────────────────────────────────────────────
  {
    id: 'ckd-protein',
    conditionMatch: ['kidney', 'renal', 'ckd', 'buah pinggang', 'nephro'],
    conditionLabel: 'Kidney condition',
    kind: 'macro',
    triggerMatch: ['protein_target'],
    triggerLabel: 'High protein target',
    severity: 'avoid',
    evidence: 'established',
    note: 'Protein intake is managed clinically in kidney disease, and this app sets a high target by default for cutting. Do not use these numbers — get them from your doctor or renal dietitian.',
    source: 'Protein restriction is standard in CKD management.',
    reviewed: false,
  },
  {
    id: 'ckd-creatine',
    conditionMatch: ['kidney', 'renal', 'ckd', 'buah pinggang', 'nephro'],
    conditionLabel: 'Kidney condition',
    kind: 'supplement',
    triggerMatch: ['creatine', 'kreatin'],
    triggerLabel: 'Creatine',
    severity: 'avoid',
    evidence: 'established',
    note: 'Creatine supplementation is generally advised against with existing kidney disease. This is a doctor’s call, not an app’s.',
    source: 'Standard caution for creatine with pre-existing renal impairment.',
    reviewed: false,
  },

  // ── diabetes ────────────────────────────────────────────────────────────
  {
    id: 'dm-sugar',
    conditionMatch: ['diabet', 'kencing manis', 't2d', 't1d'],
    conditionLabel: 'Diabetes',
    kind: 'food',
    triggerMatch: ['teh tarik', 'kopi peng', 'bubble tea', 'sweetened', 'condensed milk', 'syrup', 'cendol', 'ais kacang', 'dessert', 'kuih'],
    triggerLabel: 'High-sugar items',
    severity: 'caution',
    evidence: 'established',
    note: 'Sweetened drinks and desserts move blood glucose quickly. You declared diabetes — your care team sets your targets, not this app.',
    source: 'Standard dietary guidance for diabetes.',
    reviewed: false,
  },
  {
    id: 'dm-fasted-training',
    conditionMatch: ['diabet', 'kencing manis', 't1d'],
    conditionLabel: 'Diabetes',
    kind: 'training',
    triggerMatch: ['fasted'],
    triggerLabel: 'Fasted training',
    severity: 'caution',
    evidence: 'established',
    note: 'Training fasted with diabetes carries hypoglycaemia risk, especially on insulin. Discuss before making this a habit — particularly during Ramadan.',
    source: 'Standard exercise guidance for people with diabetes.',
    reviewed: false,
  },

  // ── other ───────────────────────────────────────────────────────────────
  {
    id: 'gout-purine',
    conditionMatch: ['gout', 'uric acid'],
    conditionLabel: 'Gout',
    kind: 'food',
    triggerMatch: ['anchovies', 'ikan bilis', 'liver', 'hati', 'organ', 'shellfish', 'prawn', 'udang', 'beer', 'sardine'],
    triggerLabel: 'Purine-rich foods',
    severity: 'caution',
    evidence: 'established',
    note: 'Purine-rich foods are a standard consideration in gout management.',
    source: 'Standard dietary guidance for gout.',
    reviewed: false,
  },
  {
    id: 'lactose-whey',
    conditionMatch: ['lactose'],
    conditionLabel: 'Lactose intolerance',
    kind: 'supplement',
    triggerMatch: ['whey concentrate', 'milk protein', 'susu'],
    triggerLabel: 'Lactose-containing protein',
    severity: 'monitor',
    evidence: 'established',
    note: 'Whey concentrate retains lactose; isolate contains substantially less. Worth knowing before blaming the training for the stomach ache.',
    source: 'Composition difference between whey concentrate and isolate.',
    reviewed: false,
  },
  // ── movement ────────────────────────────────────────────────────────────
  // The app prescribes physical work — drills and 2-minute correctives — from
  // a phone camera. Screening food while leaving movement unscreened put the
  // riskier prescription behind the weaker guard.
  {
    id: 'knee-deep-flexion',
    conditionMatch: ['knee', 'acl', 'mcl', 'meniscus', 'patella', 'lutut'],
    conditionLabel: 'Knee condition',
    kind: 'training',
    triggerMatch: ['squat', 'lunge', 'jump', 'plyo', 'burpee', 'pistol', 'deep knee'],
    triggerLabel: 'Deep knee flexion and impact',
    severity: 'caution',
    evidence: 'established',
    note: 'Deep knee bend and landing impact load the exact structures you declared a problem with. Depth and volume are things a physio should set for you, not an app.',
    source: 'Standard loading precautions for knee injury and patellofemoral pain.',
    reviewed: false,
  },
  {
    id: 'back-loaded-flexion',
    conditionMatch: ['back pain', 'lower back', 'disc', 'slipped disc', 'sciatica', 'herniat', 'scoliosis'],
    conditionLabel: 'Back condition',
    kind: 'training',
    triggerMatch: ['deadlift', 'hinge', 'good morning', 'sit-up', 'situp', 'crunch', 'toe touch', 'row', 'twist'],
    triggerLabel: 'Loaded spinal flexion and rotation',
    severity: 'caution',
    evidence: 'established',
    note: 'Loaded bending and twisting are the movements most often restricted after a back injury. Get clearance before adding load or reps here.',
    source: 'Standard precautions for lumbar disc injury and low back pain.',
    reviewed: false,
  },
  {
    id: 'shoulder-overhead',
    conditionMatch: ['shoulder', 'rotator cuff', 'impingement', 'labrum', 'dislocat', 'bahu'],
    conditionLabel: 'Shoulder condition',
    kind: 'training',
    triggerMatch: ['overhead', 'press', 'pull-up', 'pullup', 'upright row', 'dip', 'snatch', 'jerk'],
    triggerLabel: 'Overhead and end-range shoulder loading',
    severity: 'caution',
    evidence: 'established',
    note: 'Overhead and end-range positions are the classic aggravators for shoulder injuries. Range and load want setting by someone who can examine you.',
    source: 'Standard precautions for rotator cuff and impingement syndromes.',
    reviewed: false,
  },
  {
    id: 'htn-valsalva',
    conditionMatch: ['hypertension', 'high blood pressure', 'darah tinggi', 'aneurysm', 'retinopathy'],
    conditionLabel: 'Hypertension',
    kind: 'training',
    triggerMatch: ['valsalva', 'breath hold', 'max effort', 'one rep max', '1rm', 'isometric hold', 'handstand', 'inverted'],
    triggerLabel: 'Breath-holding and inverted positions',
    severity: 'caution',
    evidence: 'established',
    note: 'Straining against a held breath spikes blood pressure sharply, and inverted positions add to it. Breathe through the effort and keep loads sub-maximal unless your doctor says otherwise.',
    source: 'Standard exercise precautions with hypertension (Valsalva response).',
    reviewed: false,
  },
  {
    id: 'pregnancy-supine',
    conditionMatch: ['pregnan', 'mengandung', 'postpartum', 'post-partum'],
    conditionLabel: 'Pregnancy / postpartum',
    kind: 'training',
    triggerMatch: ['supine', 'lying on your back', 'sit-up', 'situp', 'crunch', 'plank', 'prone', 'jump', 'contact'],
    triggerLabel: 'Supine, prone and high-impact work',
    severity: 'avoid',
    evidence: 'established',
    note: 'Abdominal work, lying flat, and impact are all managed differently through pregnancy and recovery, and it changes by stage. This needs your own clinician — not a general app.',
    source: 'Standard antenatal and postnatal exercise guidance.',
    reviewed: false,
  },
  {
    id: 'hernia-pressure',
    conditionMatch: ['hernia'],
    conditionLabel: 'Hernia',
    kind: 'training',
    triggerMatch: ['deadlift', 'squat', 'plank', 'sit-up', 'situp', 'crunch', 'heavy', 'max effort'],
    triggerLabel: 'High intra-abdominal pressure',
    severity: 'caution',
    evidence: 'established',
    note: 'Work that drives abdominal pressure up is the standard caution with a hernia, repaired or not. Worth a surgeon’s view before loading it.',
    source: 'Standard post-hernia-repair loading precautions.',
    reviewed: false,
  },

  {
    id: 'asthma-sulphite',
    conditionMatch: ['asthma', 'lelah'],
    conditionLabel: 'Asthma',
    kind: 'food',
    triggerMatch: ['dried fruit', 'wine', 'pickled', 'jeruk'],
    triggerLabel: 'Sulphite-containing foods',
    severity: 'monitor',
    evidence: 'common',
    note: 'Sulphites trigger symptoms in a minority of people with asthma.',
    source: 'Reported sulphite sensitivity in a subset of asthma patients.',
    reviewed: false,
  },
];

/* ── matching ─────────────────────────────────────────────────────────── */

/**
 * Phrases that negate the term *immediately* following them.
 *
 * Adjacency is the whole design. The tempting alternative — scan a window of a
 * few words back for any "no" — breaks in the direction that matters: given
 * "no diabetes, but I do get reflux", a window wide enough to catch "no history
 * of reflux" also swallows the real reflux declaration and suppresses the flag.
 *
 * Suppressing a true warning is the failure this module exists to prevent; an
 * extra flag is merely annoying. So the guard stays exact, and anything
 * ambiguous flags.
 */
const NEGATIONS = [
  'no ', 'not ', 'never ', 'without ',
  'no history of ', 'without history of ', 'no prior ', 'no known ',
  'tiada ', 'tak ', 'tiada sejarah ',
];

const LOOKBACK = Math.max(...NEGATIONS.map((n) => n.length));

/** True when `needle` appears in `haystack` and is not directly negated. */
export function mentions(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let from = 0;
  for (;;) {
    const i = h.indexOf(n, from);
    if (i === -1) return false;
    const before = h.slice(Math.max(0, i - LOOKBACK), i);
    // "no reflux" must not register as a declared reflux condition.
    if (!NEGATIONS.some((neg) => before.endsWith(neg))) return true;
    from = i + n.length;
  }
}

export interface ScreenInput {
  /** Free-text conditions as declared at induction. */
  conditions: string[];
  /** Dish name, item list, supplement name, macro key, or timing/training flag. */
  subjects: string[];
  /** Include `common`-evidence rules as well as `established`. */
  includeCommon?: boolean;
}

export interface Flag {
  interaction: Interaction;
  matchedCondition: string;
  matchedSubject: string;
}

/**
 * Screens subjects against declared conditions.
 * Fails safe: anything not in the table produces no claim at all.
 */
export function screen({ conditions, subjects, includeCommon = false }: ScreenInput): Flag[] {
  const flags: Flag[] = [];

  for (const rule of INTERACTIONS) {
    if (rule.evidence === 'theoretical') continue;
    if (rule.evidence === 'common' && !includeCommon) continue;

    const matchedCondition = conditions.find((c) =>
      rule.conditionMatch.some((k) => mentions(c, k)),
    );
    if (!matchedCondition) continue;

    const matchedSubject = subjects.find((s) =>
      rule.triggerMatch.some((k) => mentions(s, k)),
    );
    if (!matchedSubject) continue;

    flags.push({ interaction: rule, matchedCondition, matchedSubject });
  }

  // Most serious first; de-duplicate so one meal cannot stack five notices.
  const order: Record<Severity, number> = { avoid: 0, caution: 1, monitor: 2 };
  const seen = new Set<string>();
  return flags
    .sort((a, b) => order[a.interaction.severity] - order[b.interaction.severity])
    .filter((f) => {
      if (seen.has(f.interaction.id)) return false;
      seen.add(f.interaction.id);
      return true;
    });
}

/**
 * Screens text the app is about to *show* — including LLM-generated coach
 * comments. The vision model does not know the fighter's medical history, so
 * anything it suggests has to pass through here before it reaches a screen.
 */
export function screenSuggestion(conditions: string[], text: string): Flag[] {
  return screen({ conditions, subjects: [text] });
}

export const DISCLAIMER =
  'Flags are based on your declared conditions and widely documented interactions. This is not medical advice and not a diagnosis — check anything that matters with a doctor or dietitian.';
