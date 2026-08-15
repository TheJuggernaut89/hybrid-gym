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

/** Skeleton edges drawn on the overlay (subset of MediaPipe POSE_CONNECTIONS). */
export const POSE_EDGES: Array<[number, number]> = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32],
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
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      landmarkerRef.current = (await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })) as unknown as PoseLandmarkerLike;
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
    lastVideoTime.current = -1;
    setState((s) => (s === 'running' ? 'ready' : s));
  }, []);

  const start = useCallback(() => {
    if (!landmarkerRef.current) return;
    setState('running');

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
          } catch {
            callbackRef.current(null);
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
  }, [videoRef]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
    };
  }, []);

  return { state, error, fps, load, start, stop };
}
