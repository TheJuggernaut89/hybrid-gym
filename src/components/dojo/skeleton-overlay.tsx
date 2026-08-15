'use client';

import { useEffect, useRef } from 'react';
import { POSE_EDGES } from './use-pose-tracker';
import type { Landmark } from '@/lib/pose';

/**
 * Draws the tracked skeleton over the video. Colour follows the live form
 * score so the fighter gets feedback without reading a number.
 */
export function SkeletonOverlay({
  landmarks,
  score,
  strain,
  mirrored = true,
}: {
  landmarks: Landmark[] | null;
  score: number;
  strain: boolean;
  mirrored?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    if (!landmarks || landmarks.length === 0) return;

    const color = strain ? '#EF4444' : score >= 78 ? '#22C55E' : score >= 55 ? '#FFC107' : '#EF4444';

    const px = (lm: Landmark) => ({
      x: (mirrored ? 1 - lm.x : lm.x) * width,
      y: lm.y * height,
    });

    // Hands and head carry many more landmarks in a small area, so they get
    // finer strokes — one weight for everything turns a hand into a blob.
    const FINE = new Set([0, 2, 5, 7, 8, 9, 10, 17, 18, 19, 20, 21, 22]);
    const isFine = (a: number, b: number) => FINE.has(a) && FINE.has(b);

    // A dark under-stroke first. Over a bright gym floor or a white wall a
    // single thin coloured line disappears; the outline keeps it readable on
    // any background.
    for (const pass of ['shadow', 'line'] as const) {
      ctx.strokeStyle = pass === 'shadow' ? 'rgba(0,0,0,0.55)' : color;
      ctx.globalAlpha = pass === 'shadow' ? 0.55 : 0.95;
      ctx.lineCap = 'round';

      for (const [a, b] of POSE_EDGES) {
        const pa = landmarks[a];
        const pb = landmarks[b];
        if (!pa || !pb) continue;
        if ((pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;

        const fine = isFine(a, b);
        ctx.lineWidth = (fine ? 1.75 : 3.5) + (pass === 'shadow' ? 2 : 0);

        const p1 = px(pa);
        const p2 = px(pb);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // Joints as hard squares — no soft circles anywhere in this app.
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if ((lm.visibility ?? 1) < 0.4) continue;
      const p = px(lm);
      const s = FINE.has(i) ? 3 : 7;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.x - s / 2 - 1, p.y - s / 2 - 1, s + 2, s + 2);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }, [landmarks, score, strain, mirrored]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={640}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
