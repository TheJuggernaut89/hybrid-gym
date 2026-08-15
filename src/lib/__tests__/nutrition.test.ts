/**
 * macro targets
 *
 * Ported from the throwaway Node harness used during the build. These run
 * against src/lib directly, so they fail if the logic drifts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { basalRate, activityFactorFor, computeTargets, sumIntake, isToday, needsProfessionalNote, } from '../nutrition';

test("macro targets", () => {
let pass = 0, fail = 0;
const eq = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const ok = (n: string, cond: unknown, info?: string) => { cond ? pass++ : fail++; if (!cond) console.log(`FAIL ${n}${info?' :: '+info:''}`); };

const fighter = (over = {}) => ({
  id: 'x', name: 'T', clan_tag: 'C', level: 1, total_xp: 0,
  craft_xp: 0, engine_xp: 0, strength_xp: 0, power_xp: 0, recovery_xp: 0,
  streak_count: 0, rest_shields: 0, last_active_date: null,
  biological_data: { age: 27, sex: 'male', height_cm: 174, weight_kg: 78 },
  medical_conditions: [], goals: [], onboarded: true, ...over,
});

// ── Mifflin-St Jeor, checked by hand ────────────────────────────────────────
// 10*78 + 6.25*174 - 5*27 + 5 = 780 + 1087.5 - 135 + 5 = 1737.5 -> 1738
eq('BMR male', basalRate({ age: 27, height_cm: 174, weight_kg: 78, sex: 'male' }), 1738);
eq('BMR female', basalRate({ age: 27, height_cm: 174, weight_kg: 78, sex: 'female' }), 1572);
ok('BMR other sits between', (() => {
  const m = basalRate({ age: 27, height_cm: 174, weight_kg: 78, sex: 'male' });
  const f = basalRate({ age: 27, height_cm: 174, weight_kg: 78, sex: 'female' });
  const o = basalRate({ age: 27, height_cm: 174, weight_kg: 78, sex: 'other' });
  return o < m && o > f;
})());
ok('BMR falls with age', basalRate({age:50,height_cm:174,weight_kg:78,sex:'male'}) <
                          basalRate({age:27,height_cm:174,weight_kg:78,sex:'male'}));

// ── activity ladder is monotonic ────────────────────────────────────────────
const ladder = [0,1,2,3,4,5,6,9].map(activityFactorFor);
ok('activity ladder monotonic', ladder.every((v,i)=> i===0 || v >= ladder[i-1]), ladder.join(','));
eq('sedentary', activityFactorFor(0), 1.3);
eq('six plus', activityFactorFor(6), 1.75);

// ── goals ───────────────────────────────────────────────────────────────────
const cut = computeTargets(fighter({ goals: ['Weight cut', 'Striking technique'] }), 4);
const maint = computeTargets(fighter({ goals: ['Conditioning'] }), 4);
ok('cut is below maintenance', cut.calories < maint.calories, `${cut.calories} vs ${maint.calories}`);
eq('cut label', cut.goalLabel, 'Weight cut');
eq('cut adjustment', cut.adjustmentPct, -0.2);
eq('maintenance adjustment', maint.adjustmentPct, 0);
ok('cut raises protein per kg', cut.protein_g > maint.protein_g, `${cut.protein_g} vs ${maint.protein_g}`);
eq('cut protein = 2.0 g/kg', cut.protein_g, 156);
eq('maintenance protein = 1.8 g/kg', maint.protein_g, 140);
eq('cut takes priority over later goals',
   computeTargets(fighter({goals:['Conditioning','Weight cut']}), 4).goalLabel, 'Weight cut');

// ── macros reconcile back to the calorie target ─────────────────────────────
for (const [name, t] of Object.entries({ cut, maint })) {
  const kcal = t.protein_g * 4 + t.carbs_g * 4 + t.fats_g * 9;
  ok(`${name}: macros sum to target (within rounding)`, Math.abs(kcal - t.calories) <= 12,
     `sum=${kcal} target=${t.calories}`);
  ok(`${name}: fat ~25% of calories`, Math.abs((t.fats_g*9)/t.calories - 0.25) < 0.02);
  ok(`${name}: all macros positive`, t.protein_g>0 && t.carbs_g>0 && t.fats_g>0, JSON.stringify(t));
}

// ── safety floor: never prescribe under 1.1x BMR ────────────────────────────
// A light, sedentary fighter on a cut is where the naive maths goes unsafe.
const tiny = computeTargets(
  fighter({ biological_data: { age: 45, sex: 'female', height_cm: 150, weight_kg: 46 }, goals: ['Weight cut'] }),
  0,
);
ok('never below 1.1x BMR', tiny.calories >= Math.round(tiny.bmr * 1.1),
   `cal=${tiny.calories} bmr=${tiny.bmr} floor=${Math.round(tiny.bmr*1.1)}`);

// ── missing biometrics are flagged, not silently guessed ────────────────────
const partial = computeTargets(fighter({ biological_data: { age: 27 } }), 3);
eq('incomplete biometrics flagged', partial.estimated, true);
ok('incomplete still yields a usable number', partial.calories > 1000);
eq('complete biometrics not flagged', cut.estimated, false);

// ── intake summing ──────────────────────────────────────────────────────────
const logs = [
  { calories: 780, protein_g: 34, carbs_g: 88, fats_g: 33 },
  { calories: 545, protein_g: 42, carbs_g: 62, fats_g: 14 },
  { calories: null, protein_g: null, carbs_g: null, fats_g: null },
];
eq('sumIntake ignores nulls', sumIntake(logs),
   { calories: 1325, protein_g: 76, carbs_g: 150, fats_g: 47 });
eq('sumIntake of nothing', sumIntake([]), { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 });

// ── today filter ────────────────────────────────────────────────────────────
const now = new Date('2026-08-14T12:00:00');
ok('same day is today', isToday(new Date('2026-08-14T23:30:00').toISOString(), now));
ok('yesterday is not today', !isToday(new Date('2026-08-13T23:30:00').toISOString(), now));

// ── medical escalation ──────────────────────────────────────────────────────
ok('hypertension triggers the note', needsProfessionalNote(fighter({ medical_conditions: ['Mild hypertension'] })));
ok('diabetes triggers the note', needsProfessionalNote(fighter({ medical_conditions: ['Type 2 Diabetes'] })));
ok('knee injury does not', !needsProfessionalNote(fighter({ medical_conditions: ['Knee injury'] })));
ok('no conditions does not', !needsProfessionalNote(fighter({ medical_conditions: [] })));

// The harness tallies rather than throws, so without this the suite
// reports green no matter what the assertions above found.
assert.equal(fail, 0, `${fail} of ${pass + fail} assertions failed — see the FAIL lines above`);
assert.ok(pass > 0, 'suite ran no assertions at all');
});
