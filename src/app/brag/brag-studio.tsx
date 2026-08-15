'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Share2, RefreshCw } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BragCard {
  name: string;
  clan: string;
  level: number;
  totalXp: number;
  levelPct: number;
  streak: number;
  tierName: string;
  tierColor: string;
  weekCalories: number;
  weekMinutes: number;
  weekDrills: number;
  bestForm: number;
}

const W = 1080;
const H = 1920;

// Font *families* only — size and weight are prepended at each call site.
// Baking a size in here yields an unparseable font shorthand, which the browser
// silently resolves to a family that does not exist.
//
// These are fallbacks. next/font emits a *hashed* family name (`__Teko_9f9e32`),
// so drawing with the literal "Teko" quietly renders in Impact instead. The real
// names are read from the CSS variables at draw time.
const DISPLAY_FALLBACK = 'Teko, Impact, sans-serif';
const MONO_FALLBACK = 'JetBrains Mono, ui-monospace, monospace';

function resolveFamilies() {
  if (typeof window === 'undefined') {
    return { display: DISPLAY_FALLBACK, mono: MONO_FALLBACK };
  }
  const root = getComputedStyle(document.documentElement);
  const display = root.getPropertyValue('--font-display').trim();
  const mono = root.getPropertyValue('--font-mono').trim();
  return {
    display: display ? `${display}, Impact, sans-serif` : DISPLAY_FALLBACK,
    mono: mono ? `${mono}, ui-monospace, monospace` : MONO_FALLBACK,
  };
}

const GOLD = '#FFC107';
const RED = '#EF4444';
const GREEN = '#22C55E';
const EDGE = '#27272A';

type Layout = 'levelup' | 'weekly' | 'streak';

const LAYOUTS: Array<{ id: Layout; label: string; sub: string }> = [
  { id: 'levelup', label: 'LEVEL UP', sub: 'Rank + total XP' },
  { id: 'weekly', label: 'WEEK HAUL', sub: 'Last 7 days' },
  { id: 'streak', label: 'STREAK', sub: 'Consecutive days' },
];

export function BragStudio({ card }: { card: BragCard }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout>('levelup');
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState('');

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { display: DISPLAY_FAMILY, mono: MONO_FAMILY } = resolveFamilies();

    // `document.fonts.ready` alone is not enough: it resolves immediately when
    // nothing has requested the face yet, and canvas draws would then silently
    // use the fallback. Force the exact faces we draw with to load first.
    try {
      await Promise.all([
        document.fonts.load(`700 340px ${DISPLAY_FAMILY}`),
        document.fonts.load(`700 96px ${DISPLAY_FAMILY}`),
        document.fonts.load(`600 34px ${MONO_FAMILY}`),
        document.fonts.load(`700 74px ${MONO_FAMILY}`),
      ]);
      await document.fonts.ready;
    } catch {
      /* older browsers — fall through and draw with whatever resolves */
    }

    // base
    ctx.fillStyle = '#0B0B0B';
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = 'rgba(39,39,42,0.9)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 90) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // frame
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 4;
    ctx.strokeRect(60, 60, W - 120, H - 120);

    // corner brackets
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 10;
    const b = 70;
    const corners: Array<[number, number, number, number]> = [
      [60, 60, 1, 1],
      [W - 60, 60, -1, 1],
      [60, H - 60, 1, -1],
      [W - 60, H - 60, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * b, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * b);
      ctx.stroke();
    }

    // header
    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = `600 34px ${MONO_FAMILY}`;
    ctx.fillText('HYBRID COMBATIVE', W / 2, 210);
    ctx.fillStyle = '#71717A';
    ctx.font = `500 24px ${MONO_FAMILY}`;
    ctx.fillText('D A M A N S A R A', W / 2, 258);

    // bull crest
    drawBull(ctx, W / 2, 400, 150, card.tierColor);

    // name
    ctx.fillStyle = '#FAFAFA';
    ctx.font = `700 96px ${DISPLAY_FAMILY}`;
    ctx.fillText(fitText(ctx, card.name.toUpperCase(), W - 200), W / 2, 620);

    ctx.fillStyle = card.tierColor;
    ctx.font = `600 30px ${MONO_FAMILY}`;
    ctx.fillText(`${card.tierName}  //  CLAN ${card.clan.toUpperCase()}`, W / 2, 672);

    const heroY = 900;

    if (layout === 'levelup') {
      ctx.fillStyle = '#52525B';
      ctx.font = `500 30px ${MONO_FAMILY}`;
      ctx.fillText('LEVEL', W / 2, heroY - 130);

      ctx.fillStyle = GOLD;
      ctx.font = `700 340px ${DISPLAY_FAMILY}`;
      ctx.fillText(String(card.level), W / 2, heroY + 130);

      ctx.fillStyle = '#A1A1AA';
      ctx.font = `500 34px ${MONO_FAMILY}`;
      ctx.fillText(`${card.totalXp.toLocaleString()} TOTAL XP`, W / 2, heroY + 200);

      drawMeter(ctx, 180, heroY + 250, W - 360, 26, card.levelPct, GOLD);
      ctx.fillStyle = '#52525B';
      ctx.font = `500 24px ${MONO_FAMILY}`;
      ctx.fillText(`${card.levelPct}% TO LEVEL ${card.level + 1}`, W / 2, heroY + 320);
    }

    if (layout === 'weekly') {
      ctx.fillStyle = '#52525B';
      ctx.font = `500 30px ${MONO_FAMILY}`;
      ctx.fillText('LAST 7 DAYS', W / 2, heroY - 160);

      ctx.fillStyle = GOLD;
      ctx.font = `700 250px ${DISPLAY_FAMILY}`;
      ctx.fillText(card.weekCalories.toLocaleString(), W / 2, heroY + 50);

      ctx.fillStyle = '#A1A1AA';
      ctx.font = `500 36px ${MONO_FAMILY}`;
      ctx.fillText('CALORIES BURNED', W / 2, heroY + 110);

      drawStatRow(ctx, heroY + 200, [
        ['ACTIVE MIN', String(card.weekMinutes), GOLD],
        ['DRILLS', String(card.weekDrills), GREEN],
        ['BEST FORM', `${card.bestForm}%`, GOLD],
      ], MONO_FAMILY);
    }

    if (layout === 'streak') {
      ctx.fillStyle = '#52525B';
      ctx.font = `500 30px ${MONO_FAMILY}`;
      ctx.fillText('CONSECUTIVE DAYS', W / 2, heroY - 160);

      ctx.fillStyle = card.streak > 0 ? RED : '#3F3F46';
      ctx.font = `700 340px ${DISPLAY_FAMILY}`;
      ctx.fillText(String(card.streak), W / 2, heroY + 90);

      ctx.fillStyle = '#A1A1AA';
      ctx.font = `500 36px ${MONO_FAMILY}`;
      ctx.fillText('DAY STREAK / STILL ALIVE', W / 2, heroY + 160);

      const cells = Math.min(Math.max(card.streak, 1), 14);
      const gap = 12;
      const totalW = W - 360;
      const cellW = (totalW - gap * (cells - 1)) / cells;
      for (let i = 0; i < cells; i += 1) {
        const x = 180 + i * (cellW + gap);
        ctx.fillStyle = 'rgba(239,68,68,0.3)';
        ctx.fillRect(x, heroY + 220, cellW, 60);
        ctx.strokeStyle = RED;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, heroY + 220, cellW, 60);
      }
    }

    // footer
    ctx.textAlign = 'center';
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(180, H - 300);
    ctx.lineTo(W - 180, H - 300);
    ctx.stroke();

    ctx.fillStyle = '#71717A';
    ctx.font = `500 28px ${MONO_FAMILY}`;
    ctx.fillText('NO ADS. NO FLUFF. JUST WORK.', W / 2, H - 230);

    ctx.fillStyle = GOLD;
    ctx.font = `600 26px ${MONO_FAMILY}`;
    ctx.fillText('#HYBRIDCOMBATIVE', W / 2, H - 175);

    setReady(true);
  }, [card, layout]);

  useEffect(() => {
    void draw();
  }, [draw]);

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  async function download() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hybrid-${layout}-${card.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setNote('Card saved. Post it or do not, the work happened either way.');
  }

  async function share() {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], 'hybrid-brag.png', { type: 'image/png' });

    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Hybrid Combative' });
        setNote('Shared.');
        return;
      } catch {
        // Cancelled, or the share target rejected it. Fall through to download.
      }
    }
    setNote('Sharing is not available here. Downloading instead.');
    await download();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-px border border-edge bg-edge">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLayout(l.id)}
            className={cn(
              'px-2 py-2.5 text-left transition-colors duration-100',
              layout === l.id ? 'bg-gold text-canvas' : 'bg-canvas text-dim',
            )}
          >
            <span className="block text-h3 leading-none display">{l.label}</span>
            <span className="block font-mono text-micro tracking-[0.1em] opacity-70">{l.sub}</span>
          </button>
        ))}
      </div>

      <Panel brackets>
        <PanelHeader label="PREVIEW" right="1080 x 1920" />
        <div className="p-3">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="mx-auto block w-full max-w-[260px] border border-edge"
          />
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="ghost" onClick={() => void draw()}>
          <RefreshCw size={14} />
        </Button>
        <Button variant="ghost" onClick={download} disabled={!ready}>
          <Download size={14} />
          SAVE
        </Button>
        <Button onClick={share} disabled={!ready}>
          <Share2 size={14} />
          SHARE
        </Button>
      </div>

      {note ? (
        <p className="border-l-2 border-gold pl-2 font-sans text-read text-dim">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/* canvas helpers */

/** Truncates a name that would overrun the card width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 3 && ctx.measureText(`${out}...`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

function drawBull(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';

  ctx.beginPath();
  ctx.moveTo(4, 7);
  ctx.bezierCurveTo(4, 4.5, 6, 3.5, 8, 4.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(20, 7);
  ctx.bezierCurveTo(20, 4.5, 18, 3.5, 16, 4.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(8, 4.5);
  ctx.lineTo(8, 9);
  ctx.bezierCurveTo(8, 13, 10, 16, 12, 18);
  ctx.bezierCurveTo(14, 16, 16, 13, 16, 9);
  ctx.lineTo(16, 4.5);
  ctx.stroke();

  ctx.fillStyle = RED;
  ctx.fillRect(9, 8.4, 2, 1.7);
  ctx.fillRect(13, 8.4, 2, 1.7);
  ctx.restore();
}

function drawMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: string,
) {
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 3, y + 3, ((w - 6) * Math.min(100, Math.max(0, pct))) / 100, h - 6);
}

function drawStatRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  cells: Array<[string, string, string]>,
  monoFamily: string,
) {
  const pad = 180;
  const totalW = W - pad * 2;
  const cellW = totalW / cells.length;

  cells.forEach(([label, value, color], i) => {
    const x = pad + i * cellW;
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, cellW, 170);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#52525B';
    ctx.font = `500 22px ${monoFamily}`;
    ctx.fillText(label, x + cellW / 2, y + 50);

    ctx.fillStyle = color;
    ctx.font = `700 74px ${monoFamily}`;
    ctx.fillText(value, x + cellW / 2, y + 128);
  });
}
