/**
 * interaction screen
 *
 * Ported from the throwaway Node harness used during the build. These run
 * against src/lib directly, so they fail if the logic drifts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { screen, screenSuggestion, mentions, INTERACTIONS, DISCLAIMER, } from '../contraindications';

test("interaction screen", () => {
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); n++; };

/* ── table integrity ──────────────────────────────────────────────────── */
const ids = INTERACTIONS.map((i) => i.id);
eq(new Set(ids).size, ids.length, 'ids are unique');
for (const r of INTERACTIONS) {
  ok(r.source && r.source.length > 10, `${r.id} carries a source`);
  ok(r.note.length > 30, `${r.id} note is substantive`);
  ok(r.conditionMatch.length > 0 && r.triggerMatch.length > 0, `${r.id} has both sides`);
  ok(r.reviewed === false, `${r.id} is honestly marked unreviewed`);
  // The whole design rests on deferring outward rather than prescribing.
  ok(
    !/\byou should\b|\btake \d|\bswitch to\b|\binstead take\b/i.test(r.note),
    `${r.id} does not prescribe`,
  );
}
ok(DISCLAIMER.includes('not medical advice'), 'disclaimer disclaims');

/* ── the exact case the user raised ───────────────────────────────────── */
// Coach line suggests lime; fighter declared reflux at induction.
const lime = screenSuggestion(
  ['Acid reflux (GERD)'],
  'Solid plate. Squeeze some lime over it next time to cut the richness.',
);
eq(lime.length, 1, 'lime + reflux produces exactly one flag');
eq(lime[0].interaction.id, 'gerd-acidic', 'flagged as acidic-food interaction');
eq(lime[0].matchedSubject.includes('lime'), true, 'names what matched');

// Same suggestion, no declared reflux → silence.
eq(screenSuggestion(['Asthma'], 'Squeeze some lime over it.').length, 0,
  'no reflux declared, no reflux flag');

/* ── protein: accurate, not alarmist ──────────────────────────────────── */
// The user asked about "too much protein". It is a real issue in CKD and not
// a general one, so the rule must fire for kidneys and stay quiet otherwise.
const ckd = screen({ conditions: ['Chronic kidney disease stage 3'], subjects: ['protein_target'] });
eq(ckd.length, 1, 'CKD flags the protein target');
eq(ckd[0].interaction.severity, 'avoid', 'and does so at avoid severity');

eq(screen({ conditions: ['Acid reflux'], subjects: ['protein_target'] }).length, 0,
  'protein target is NOT flagged for a healthy-kidney fighter');
eq(screen({ conditions: [], subjects: ['protein_target'] }).length, 0,
  'no declared conditions means no flags at all');

/* ── negation guard ───────────────────────────────────────────────────── */
ok(mentions('acid reflux', 'reflux'), 'plain mention matches');
ok(!mentions('no reflux', 'reflux'), '"no reflux" does not match');
ok(!mentions('without reflux symptoms', 'reflux'), '"without reflux" does not match');
ok(mentions('tak sihat, ada reflux', 'reflux'), 'Malay negation only guards its own clause');
ok(!mentions('no history of reflux', 'reflux'), '"no history of X" is a recognised negation');
eq(screen({ conditions: ['no history of reflux'], subjects: ['lime juice'] }).length, 0,
  'negated condition produces no flag');

// The failure direction is deliberate: a distant "no" must NOT suppress a real
// declaration. This asserts the safe behaviour, not merely the current one.
ok(mentions('no diabetes, but I do get reflux', 'reflux'),
  'a negation governing an earlier term does not swallow a later declaration');
eq(screen({ conditions: ['no diabetes, but I do get reflux'], subjects: ['lime'] }).length, 1,
  'real reflux declaration still flags despite an unrelated negation in the same string');

/* ── severity ordering and de-duplication ─────────────────────────────── */
const multi = screen({
  conditions: ['Chronic kidney disease', 'acid reflux'],
  subjects: ['protein_target', 'lime and sambal on the side', 'kopi'],
});
eq(multi[0].interaction.severity, 'avoid', 'most serious flag sorts first');
eq(new Set(multi.map((f) => f.interaction.id)).size, multi.length, 'no duplicate rules');
// lime and sambal are two distinct rules, so both should appear.
ok(multi.some((f) => f.interaction.id === 'gerd-acidic'), 'acidic rule present');
ok(multi.some((f) => f.interaction.id === 'gerd-spicy'), 'spicy rule present');

/* ── evidence gating ──────────────────────────────────────────────────── */
// asthma-sulphite is `common`, so it must stay hidden by default.
eq(screen({ conditions: ['Asthma'], subjects: ['dried fruit'] }).length, 0,
  'common-evidence rules are withheld by default');
eq(screen({ conditions: ['Asthma'], subjects: ['dried fruit'], includeCommon: true }).length, 1,
  'and surface only when explicitly requested');

/* ── stimulants + cardiac ─────────────────────────────────────────────── */
const stim = screenSuggestion(['Hypertension'], 'Smash a pre-workout before the next round.');
eq(stim.length, 1, 'pre-workout flags against hypertension');
eq(stim[0].interaction.severity, 'avoid', 'at avoid severity');

/* ── fails safe on junk ───────────────────────────────────────────────── */
eq(screen({ conditions: ['zxqv'], subjects: ['zxqv'] }).length, 0, 'unknown condition, no claim');
eq(screen({ conditions: [''], subjects: [''] }).length, 0, 'empty strings produce nothing');
eq(screen({ conditions: ['Diabetes'], subjects: ['grilled chicken breast'] }).length, 0,
  'an unremarkable meal produces no noise');

/* ── movement contraindications ───────────────────────────────────────── */
// A drill is a physical prescription. Screening food while leaving movement
// unscreened put the riskier instruction behind the weaker guard.
const knee = screen({ conditions: ['Old ACL tear, left knee'], subjects: ['Fighter Squat', 'Knees'] });
eq(knee.length, 1, 'a declared knee injury flags a squat drill');
eq(knee[0].interaction.kind, 'training', 'and it is a training-kind rule');

eq(screen({ conditions: ['Old ACL tear, left knee'], subjects: ['Jab-Cross Shadow', 'Shoulders'] }).length, 0,
  'shadow boxing does NOT flag for a knee — no blanket warnings');

ok(screen({ conditions: ['slipped disc L4/L5'], subjects: ['Deadlift'] }).length > 0,
  'a disc injury flags loaded spinal flexion');
ok(screen({ conditions: ['rotator cuff tear'], subjects: ['Overhead press'] }).length > 0,
  'a shoulder injury flags overhead work');
ok(screen({ conditions: ['Pregnant, 2nd trimester'], subjects: ['Fight Plank'] })
  .some((f) => f.interaction.severity === 'avoid'),
  'pregnancy flags supine/abdominal work at avoid severity');

// Movement rules must not fire on unrelated conditions.
eq(screen({ conditions: ['Lactose intolerance'], subjects: ['Fighter Squat'] }).length, 0,
  'an unrelated condition produces no movement flag');
eq(screen({ conditions: ['no knee problems'], subjects: ['Fighter Squat'] }).length, 0,
  'a negated knee condition produces no movement flag');

});
