'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Landmark } from '@/lib/pose';

export type TrackerState = 'idle' | 'loading' | 'ready' | 'running' | 'error';

const WASM_URL =
  process.env.NEXT_PUBLIC_MEDIAPIPE_WASM ||
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

const MODEL_URL =
  process.env.NEXT_PUBLIC_POSE_MODEL ||
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/**
 * Skeleton edges drawn on the overlay.
 *
 * MediaPipe Pose returns 33 landmarks. Only the trunk and limbs were drawn
 * before, which reads as a stick figure rather than as tracking — the hands
 * and head are what make it obvious the camera is following YOU.
 *
 * Landmark map: 0 nose · 2/5 eyes · 7/8 ears · 9/10 mouth · 11/12 shoulders
 * 13/14 elbows · 15/16 wrists · 17/18 pinky · 19/20 index · 21/22 thumb
 * 23/24 hips · 25/26 knees · 27/28 ankles · 29/30 heels · 31/32 toes.
 *
 * Note this gives THREE points per hand, not the 21 of a full hand model — a
 * fan, not fingers. Real finger tracking needs MediaPipe HandLandmarker
 * running alongside, which costs frame rate that squats and hinges do not
 * need. See the README.
 */
export const POSE_EDGES: Array<[number, number]> = [
  // head — nose to eyes to ears, plus the mouth line
  [0, 2], [0, 5], [2, 7], [5, 8], [9, 10],
  // neck: nose down to the midpoint is implicit; tie head to both shoulders
  [0, 11], [0, 12],
  // trunk
  [11, 12], [11, 23], [12, 24], [23, 24],
  // arms
  [11, 13], [13, 15], [12, 14], [14, 16],
  // left hand fan
  [15, 17], [15, 19], [15, 21], [17, 19],
  // right hand fan
  [16, 18], [16, 20], [16, 22], [18, 20],
  // legs
  [23, 25], [25, 27], [24, 26], [26, 28],
  // feet, including the heel so the ankle does not float
  [27, 29], [29, 31], [27, 31],
  [28, 30], [30, 32], [28, 32],
];

interface Options {
  onLandmarks: (landmarks: Landmark[] | null) => void;
}

/** Minimal structural type for the bits of PoseLandmarker we actually call. */
interface PoseLandmarkerLike {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => { landmarks?: Landmark[][] } | undefined;
  close?: () => void;
}

/**
 * Client-side MediaPipe Pose. Everything runs on-device — no frames leave the
 * phone. The model is fetched once from a CDN (override with env vars).
 */
export function usePoseTracker(
  videoRef: React.RefObject<HTMLVideoElement>,
  { onLandmarks }: Options,
) {
  const [state, setState] = useState<TrackerState>('idle');
  const [error, setError] = useState('');
  const [fps, setFps] = useState(0);
  const [backend, setBackend] = useState<'GPU' | 'CPU' | null>(null);
  /** True when the loop is running but no frame has landed for a while. */
  const [stalled, setStalled] = useState(false);
  const stalledRef = useRef(false);
  const processedRef = useRef(0);
  const lastThrowRef = useRef('');
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  stalledRef.current = stalled;

  // MediaPipe's PoseLandmarker type is only available after the dynamic import,
  // so the ref is intentionally untyped here.
  const landmarkerRef = useRef<PoseLandmarkerLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTime = useRef(-1);
  const frameTimes = useRef<number[]>([]);
  const callbackRef = useRef(onLandmarks);
  callbackRef.current = onLandmarks;

  const load = useCallback(async () => {
    if (landmarkerRef.current) {
      setState('ready');
      return;
    }
    setState('loading');
    setError('');

    const build = async (delegate: 'GPU' | 'CPU') => {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      return (await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })) as unknown as PoseLandmarkerLike;
    };

    try {
      // GPU first, but never only GPU. WebGL is unavailable or blocked on more
      // devices than you would expect — older Androids, hardware acceleration
      // switched off in desktop Chrome, some in-app browsers — and the failure
      // shows up as a landmarker that builds and then never emits a frame.
      // CPU is slower and completely usable for these drills.
      try {
        landmarkerRef.current = await build('GPU');
        setBackend('GPU');
      } catch {
        landmarkerRef.current = await build('CPU');
        setBackend('CPU');
      }
      setState('ready');
    } catch (err) {
      setState('error');
      setError(
        err instanceof Error
          ? `Pose engine failed to load: ${err.message}`
          : 'Pose engine failed to load.',
      );
    }
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = null;
    setStalled(false);
    lastVideoTime.current = -1;
    setState((s) => (s === 'running' ? 'ready' : s));
  }, []);

  const start = useCallback(() => {
    // Previously a bare early return: if the model never built, arming the
    // drill did nothing at all and the member watched a black frame with 0 FPS
    // and no explanation.
    if (!landmarkerRef.current) {
      setState('error');
      setError('Pose engine is not loaded. Reload the page and arm again.');
      return;
    }
    setStalled(false);
    setState('running');

    const armedAt = performance.now();
    processedRef.current = 0;
    lastThrowRef.current = '';

    const tick = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && landmarker && video.readyState >= 2) {
        if (video.currentTime !== lastVideoTime.current) {
          lastVideoTime.current = video.currentTime;
          try {
            const result = landmarker.detectForVideo(video, performance.now());
            const pose = result?.landmarks?.[0] as Landmark[] | undefined;
            callbackRef.current(pose ?? null);
            processedRef.current++;
          } catch (err) {
            // Swallowing this used to make a permanently broken engine look
            // exactly like an empty room: no landmarks, no error, no clue.
            callbackRef.current(null);
            lastThrowRef.current = err instanceof Error ? err.message : 'detection failed';
          }

          const now = performance.now();
          frameTimes.current.push(now);
          if (frameTimes.current.length > 20) frameTimes.current.shift();
          const span = now - frameTimes.current[0];
          if (span > 0) setFps(Math.round(((frameTimes.current.length - 1) / span) * 1000));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    // ── watchdog ────────────────────────────────────────────────────────
    // On a TIMER, deliberately, not inside the rAF loop.
    //
    // The first version checked for a stall from within tick(), which shares
    // the failure it is supposed to catch: if requestAnimationFrame never
    // runs — background tab, throttled webview, compositor asleep — then the
    // loop is dead AND so is the check, and the member watches a black frame
    // with 0 FPS and no warning. A watchdog cannot depend on the thing it
    // watches.
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = setInterval(() => {
      const processed = processedRef.current;
      if (!processed && performance.now() - armedAt > 4000) {
        setStalled(true);
        setError(
          lastThrowRef.current
            ? `Pose engine is erroring on every frame: ${lastThrowRef.current}`
            : 'No camera frames are reaching the pose engine. Check the camera permission, and that nothing else is using the camera.',
        );
      } else if (processed && stalledRef.current) {
        setStalled(false);
        setError('');
      }
    }, 1000);
  }, [videoRef]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
    };
  }, []);

  return { state, error, fps, backend, stalled, load, start, stop };
}
