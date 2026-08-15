/**
 * camera frame quality gate
 *
 * Ported from the throwaway Node harness used during the build. These run
 * against src/lib directly, so they fail if the logic drifts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { scoreImageData } from '../frame-quality';

test("camera frame quality gate", () => {
const W = 160, H = 120;
let pass = 0, fail = 0;
const ok = (name: string, cond: unknown, info?: string) => {
  cond ? pass++ : fail++;
  if (!cond) console.log(`FAIL ${name}${info ? ' :: ' + info : ''}`);
};

/** Build an RGBA buffer from a per-pixel luma function. */
function frame(fn) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fn(x, y);
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  return d;
}

const inCentre = (x, y) => x >= W * 0.2 && x < W * 0.8 && y >= H * 0.2 && y < H * 0.8;

// ── exposure ────────────────────────────────────────────────────────────────
const flatMid = scoreImageData(frame(() => 128), W, H);
ok('flat mid-grey: perfect exposure', flatMid.brightness === 100, `got ${flatMid.brightness}`);
ok('flat mid-grey: no sharpness', flatMid.sharpness === 0, `got ${flatMid.sharpness}`);
ok('flat mid-grey: not ready', flatMid.ready === false);

const black = scoreImageData(frame(() => 0), W, H);
ok('black frame: brightness 0', black.brightness === 0, `got ${black.brightness}`);
ok('black frame: not ready', black.ready === false);

const white = scoreImageData(frame(() => 255), W, H);
ok('blown-out frame: brightness 0', white.brightness === 0, `got ${white.brightness}`);

const dim = scoreImageData(frame(() => 55), W, H);
ok('dim frame scores between', dim.brightness > 0 && dim.brightness < 100, `got ${dim.brightness}`);

// ── sharpness ───────────────────────────────────────────────────────────────
const checker = scoreImageData(frame((x, y) => ((x + y) % 2 ? 200 : 56)), W, H);
ok('hard checkerboard: max sharpness', checker.sharpness === 100, `got ${checker.sharpness}`);

const gradient = scoreImageData(frame((x) => 90 + Math.round((x / W) * 70)), W, H);
ok('smooth gradient: low sharpness', gradient.sharpness < 20, `got ${gradient.sharpness}`);

// A soft, low-amplitude ripple stands in for motion blur.
const blurry = scoreImageData(frame((x, y) => 128 + Math.round(6 * Math.sin(x / 9) * Math.cos(y / 9))), W, H);
ok('soft ripple reads as blurry', blurry.sharpness < 45, `got ${blurry.sharpness}`);
ok('blurry frame is not ready', blurry.ready === false);

// ── framing ─────────────────────────────────────────────────────────────────
const spread = scoreImageData(frame((x, y) => ((x + y) % 2 ? 200 : 56)), W, H);
ok('evenly detailed frame: fill ~0', spread.fill <= 5, `got ${spread.fill}`);

const centred = scoreImageData(
  frame((x, y) => (inCentre(x, y) ? ((x + y) % 2 ? 200 : 56) : 128)),
  W, H,
);
ok('detail only in centre: fill 100', centred.fill === 100, `got ${centred.fill}`);
ok('centred + sharp + lit => READY', centred.ready === true,
   `s=${centred.sharpness} b=${centred.brightness} f=${centred.fill}`);

// Centred subject but the whole frame is too dark => must not arm.
const centredDark = scoreImageData(
  frame((x, y) => (inCentre(x, y) ? ((x + y) % 2 ? 30 : 4) : 8)),
  W, H,
);
ok('centred but underexposed => not ready', centredDark.ready === false,
   `b=${centredDark.brightness}`);

// ── ranges ──────────────────────────────────────────────────────────────────
for (const [name, q] of Object.entries({ flatMid, black, white, checker, centred, blurry })) {
  ok(`${name}: all metrics within 0-100`,
    [q.sharpness, q.brightness, q.fill].every((v) => v >= 0 && v <= 100 && Number.isFinite(v)),
    JSON.stringify(q));
}

// The harness tallies rather than throws, so without this the suite
// reports green no matter what the assertions above found.
assert.equal(fail, 0, `${fail} of ${pass + fail} assertions failed — see the FAIL lines above`);
assert.ok(pass > 0, 'suite ran no assertions at all');
});
