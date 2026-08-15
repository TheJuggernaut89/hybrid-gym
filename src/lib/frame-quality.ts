/**
 * On-device frame quality analysis.
 *
 * Runs entirely in the browser against a downsampled copy of the video frame —
 * no network, no API cost, no latency. The point is to only ever spend a vision
 * call on a frame that is sharp, well lit and well framed, and to give the
 * fighter live feedback while they line the shot up.
 */

export interface FrameQuality {
  /** 0-100, from the variance of the Laplacian. Low = motion blur / out of focus. */
  sharpness: number;
  /** 0-100, penalising both under- and over-exposure. */
  brightness: number;
  /** 0-100, how much detail sits inside the centre box vs the whole frame. */
  fill: number;
  /** All three above their floor. */
  ready: boolean;
}

export const EMPTY_QUALITY: FrameQuality = {
  sharpness: 0,
  brightness: 0,
  fill: 0,
  ready: false,
};

/** Analysis resolution. 160x120 is ~19k pixels — trivial at 3Hz. */
const AW = 160;
const AH = 120;

/** Each metric must clear this for the shutter to arm. */
const FLOOR = { sharpness: 45, brightness: 45, fill: 35 } as const;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Maps a raw measurement onto 0-100 between a poor and a good anchor. */
function band(value: number, poor: number, good: number): number {
  return Math.round(clamp01((value - poor) / (good - poor)) * 100);
}

/**
 * Scores a frame already drawn into `ctx` at AW x AH.
 * Exported separately so it can be unit-tested without a camera.
 */
export function scoreImageData(data: Uint8ClampedArray, w: number, h: number): FrameQuality {
  // ── luma plane ───────────────────────────────────────────────────────────
  const luma = new Float32Array(w * h);
  let lumaSum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    // Rec. 601 — cheap and good enough for exposure and edge work.
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    luma[p] = y;
    lumaSum += y;
  }
  const meanLuma = lumaSum / luma.length;

  // ── sharpness: variance of the Laplacian ─────────────────────────────────
  // Also collects edge energy for the framing metric in the same pass.
  const cx0 = Math.floor(w * 0.2);
  const cx1 = Math.floor(w * 0.8);
  const cy0 = Math.floor(h * 0.2);
  const cy1 = Math.floor(h * 0.8);

  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  let centreEnergy = 0;
  let totalEnergy = 0;

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const lap =
        4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount += 1;

      const mag = Math.abs(lap);
      totalEnergy += mag;
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) centreEnergy += mag;
    }
  }

  const lapMean = lapSum / lapCount;
  const lapVariance = lapSqSum / lapCount - lapMean * lapMean;

  // Anchors from handheld phone footage: <60 is visibly soft, >600 is crisp.
  const sharpness = band(lapVariance, 60, 600);

  // ── brightness: penalise both ends ───────────────────────────────────────
  // Ideal window is roughly 90-170 mean luma; fall off outside it.
  const brightness =
    meanLuma < 90
      ? band(meanLuma, 25, 90)
      : meanLuma > 170
        ? band(255 - meanLuma, 25, 85)
        : 100;

  // ── framing: is the subject actually in the middle of the frame? ─────────
  // The centre box is 36% of the area, so an evenly-detailed frame scores ~0.36.
  // Anything above that means detail is concentrated where we want it.
  const centreShare = totalEnergy > 0 ? centreEnergy / totalEnergy : 0;
  const fill = band(centreShare, 0.36, 0.72);

  return {
    sharpness,
    brightness,
    fill,
    ready:
      sharpness >= FLOOR.sharpness &&
      brightness >= FLOOR.brightness &&
      fill >= FLOOR.fill,
  };
}

/** Draws the video into a reusable canvas and scores it. */
export function analyseVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): FrameQuality | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  canvas.width = AW;
  canvas.height = AH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, AW, AH);
  const { data } = ctx.getImageData(0, 0, AW, AH);
  return scoreImageData(data, AW, AH);
}

export { FLOOR as QUALITY_FLOOR };
