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

    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.9;

    for (const [a, b] of POSE_EDGES) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) continue;
      if ((pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;
      const p1 = px(pa);
      const p2 = px(pb);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Joints as hard squares — no soft circles anywhere in this app.
    ctx.fillStyle = color;
    for (const lm of landmarks) {
      if ((lm.visibility ?? 1) < 0.4) continue;
      const p = px(lm);
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
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
