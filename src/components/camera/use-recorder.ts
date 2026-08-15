'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
  audioExtension,
  pickAudioMime,
} from '@/lib/voice';

export type RecorderState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'denied'
  | 'unsupported'
  | 'error';

export interface Recording {
  blob: Blob;
  mime: string;
  extension: string;
  durationMs: number;
}

/**
 * Hold-to-talk recorder.
 *
 * Push-to-talk rather than tap-to-start deliberately: it can't be left running
 * by accident, it caps the utterance naturally, and short utterances transcribe
 * far better under code-switching than long ones.
 *
 * The mic stream is released the moment recording stops. Holding an open
 * microphone between notes is not something this app is going to do.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [error, setError] = useState('');
  /** 0..1, for the level meter. Purely cosmetic feedback that it is hearing you. */
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (capTimerRef.current) clearTimeout(capTimerRef.current);
    capTimerRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'requesting') return;

    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      setError('This browser cannot record audio. Type the portion instead.');
      return;
    }

    setState('requesting');
    setError('');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // A mamak at 9pm is a hostile acoustic environment; let the platform
        // do what it can before the audio ever leaves the device.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied');
        setError('Microphone blocked. Allow it in your browser settings, or type the portion.');
      } else {
        setState('error');
        setError('Could not open the microphone.');
      }
      return;
    }

    streamRef.current = stream;

    const mime = pickAudioMime((t) => MediaRecorder.isTypeSupported(t));
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      teardown();
      setState('unsupported');
      setError('This browser rejected every audio format we support.');
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsedMs(0);

    // Level meter + elapsed clock share one rAF loop.
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        setLevel(Math.min(1, peak / 90));
        setElapsedMs(Date.now() - startedAtRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Meter is decoration; recording must not depend on it.
    }

    recorder.start();
    setState('recording');

    // Hard cap, so a stuck finger cannot produce a 5-minute upload.
    capTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, MAX_RECORDING_MS);
  }, [state, teardown]);

  /** Resolves null when the press was too short to be a real note. */
  const stop = useCallback((): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      teardown();
      setState('idle');
      return Promise.resolve(null);
    }

    return new Promise<Recording | null>((resolve) => {
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        recorderRef.current = null;
        teardown();
        setState('idle');

        if (durationMs < MIN_RECORDING_MS || blob.size === 0) {
          resolve(null);
          return;
        }
        resolve({ blob, mime, extension: audioExtension(mime), durationMs });
      };
      recorder.stop();
    });
  }, [teardown]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    recorderRef.current = null;
    teardown();
    setState('idle');
  }, [teardown]);

  return { state, error, level, elapsedMs, start, stop, cancel };
}
