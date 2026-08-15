'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_QUALITY, analyseVideoFrame, type FrameQuality } from '@/lib/frame-quality';

export type CameraState = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

export interface UseCameraOptions {
  facingMode?: 'environment' | 'user';
  /** Longest edge of the captured JPEG. Keeps payloads under the 5 MB cap. */
  maxEdge?: number;
  autoStart?: boolean;
  /**
   * Run on-device frame scoring while live. Costs nothing but a little CPU and
   * lets the UI arm the shutter only on a frame worth spending a vision call on.
   */
  analyseQuality?: boolean;
  /** How often to score a frame, ms. */
  analyseIntervalMs?: number;
}

export function useCamera({
  facingMode = 'environment',
  maxEdge = 1400,
  autoStart = false,
  analyseQuality = false,
  analyseIntervalMs = 350,
}: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState('');
  const [quality, setQuality] = useState<FrameQuality>(EMPTY_QUALITY);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setQuality(EMPTY_QUALITY);
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      setError('This browser cannot open a camera. Use the upload button instead.');
      return;
    }

    setState('starting');
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState('live');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
        setError('Camera permission denied. Allow it in your browser settings, or upload a photo.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setState('unsupported');
        setError('No usable camera found. Upload a photo instead.');
      } else {
        setState('error');
        setError(err instanceof Error ? err.message : 'Camera failed to start.');
      }
    }
  }, [facingMode]);

  /** Grabs the current frame as a base64 JPEG (no data-URI prefix). */
  const capture = useCallback((): { base64: string; dataUrl: string } | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { dataUrl, base64: dataUrl.split(',')[1] ?? '' };
  }, [maxEdge]);

  // ── on-device quality loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!analyseQuality || state !== 'live') return;

    if (!analysisCanvasRef.current) {
      analysisCanvasRef.current = document.createElement('canvas');
    }

    const id = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = analysisCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const next = analyseVideoFrame(video, canvas);
      if (next) setQuality(next);
    }, analyseIntervalMs);

    return () => window.clearInterval(id);
  }, [analyseQuality, analyseIntervalMs, state]);

  useEffect(() => {
    if (autoStart) void start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { videoRef, state, error, start, stop, capture, quality };
}

/** Downscales an uploaded file to a base64 JPEG so it clears the size cap. */
export async function fileToBase64Jpeg(
  file: File,
  maxEdge = 1400,
): Promise<{ base64: string; dataUrl: string }> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not read that image.'));
      image.src = bitmapUrl;
    });

    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { dataUrl, base64: dataUrl.split(',')[1] ?? '' };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}
