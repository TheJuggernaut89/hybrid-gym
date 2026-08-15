'use client';

import { useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useRecorder } from '@/components/camera/use-recorder';
import { ScreenNotice } from '@/components/health/screen-notice';
import { HazardBar } from '@/components/ui/industrial';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Stat } from '@/components/ui/stat';
import { screen } from '@/lib/contraindications';
import { MAX_RECORDING_MS, usableTranscript } from '@/lib/voice';
import { saveNutritionLog } from '@/app/actions/workout';
import { XP_NUTRITION_LOG } from '@/lib/xp';
import { cn } from '@/lib/utils';
import type { NutritionVisionData, VisionEnvelope } from '@/lib/types';

type Phase = 'idle' | 'transcribing' | 'confirm' | 'estimating' | 'review' | 'saved';

/**
 * Log a meal you did not photograph.
 *
 * A photo is not always available — people eat, then remember to log on the
 * drive home. Requiring one made the app unusable for exactly the meals most
 * likely to go unrecorded.
 *
 * This is a legitimate input, not a degraded one: spoken portion descriptions
 * land within 10% of weighed truth more often than image-based estimation
 * does. What it loses is identification, not quantity — so the model is told
 * to invent nothing that was not said, and confidence is capped without a photo.
 */
export function VoiceMeal({ conditions }: { conditions: string[] }) {
  const { state, error, level, elapsedMs, start, stop, cancel } = useRecorder();
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [data, setData] = useState<NutritionVisionData | null>(null);
  const [coachLine, setCoachLine] = useState('');
  const [note, setNote] = useState('');

  const recording = state === 'recording';
  const blocked = state === 'denied' || state === 'unsupported';

  async function release() {
    const rec = await stop();
    if (!rec) {
      setNote('Too short — hold the button while you speak.');
      return;
    }
    setPhase('transcribing');
    setNote('');
    try {
      const body = new FormData();
      body.append('audio', rec.blob, `meal.${rec.extension}`);
      const res = await fetch('/api/transcribe', { method: 'POST', body });
      const json = (await res.json()) as
        | { status: 'success'; transcript: string }
        | { status: 'error'; message: string };

      if (json.status === 'error' || !usableTranscript(json.transcript)) {
        setNote(
          json.status === 'error'
            ? json.message
            : 'Could not make that out. Try again somewhere quieter.',
        );
        setPhase('idle');
        return;
      }
      setTranscript(json.transcript);
      setPhase('confirm');
    } catch {
      setNote('Could not reach transcription.');
      setPhase('idle');
    }
  }

  async function estimate() {
    setPhase('estimating');
    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No image at all — the transcript is the whole input.
        body: JSON.stringify({ mode: 'nutrition_vision', transcript }),
      });
      const payload = (await res.json()) as
        | VisionEnvelope<NutritionVisionData>
        | { status: 'error'; message: string };

      if (!res.ok || payload.status === 'error') {
        setNote('message' in payload ? payload.message : 'Could not estimate that.');
        setPhase('confirm');
        return;
      }
      setData(payload.data as NutritionVisionData);
      setCoachLine(payload.roast_or_hype);
      setPhase('review');
    } catch {
      setNote('Network dropped.');
      setPhase('confirm');
    }
  }

  async function save() {
    if (!data) return;
    setPhase('estimating');
    const r = await saveNutritionLog(data, coachLine);
    setNote(r.message);
    setPhase(r.ok ? 'saved' : 'review');
  }

  const flags = screen({
    conditions,
    subjects: [transcript, coachLine, data?.dish_name ?? '', ...(data?.items ?? [])].filter(
      Boolean,
    ),
  });

  if (phase === 'saved') {
    return (
      <Panel>
        <PanelHeader label="Logged" accent="engage" />
        <p className="p-3 font-mono text-read text-phosphor">{note}</p>
      </Panel>
    );
  }

  if (phase === 'review' && data) {
    return (
      <div className="space-y-3">
        <Panel>
          <PanelHeader label={data.dish_name} right="No photo" />
          <div className="grid grid-cols-2 gap-px bg-edge p-px">
            <Stat label="Calories" value={String(Math.round(data.calories ?? 0))} unit="KCAL" />
            <Stat label="Protein" value={String(Math.round(data.protein_g ?? 0))} unit="G" />
            <Stat label="Carbs" value={String(Math.round(data.carbs_g ?? 0))} unit="G" />
            <Stat label="Fats" value={String(Math.round(data.fats_g ?? 0))} unit="G" />
          </div>
          <div className="border-t border-edge px-3 py-2">
            <p className="font-mono text-read text-dim">{data.portion_note}</p>
            <p className="mt-1.5 font-mono text-read text-dim">
              <span className="text-gold">FROM</span> &ldquo;{transcript}&rdquo;
            </p>
            <p className="mt-1.5 font-mono text-read text-dim">
              CONFIDENCE {data.confidence.toUpperCase()} · Estimated from a description, with
              no photo. Edit on the day&rsquo;s log if it is off.
            </p>
          </div>
        </Panel>

        <ScreenNotice flags={flags} />

        {coachLine ? (
          <Panel>
            <PanelHeader label="Coach" accent="fight" />
            <p className="p-3 font-mono text-read italic text-phosphor">
              &ldquo;{coachLine}&rdquo;
            </p>
          </Panel>
        ) : null}

        <div className="grid grid-cols-2 gap-px bg-edge">
          <button
            type="button"
            onClick={() => {
              setPhase('idle');
              setData(null);
              setTranscript('');
            }}
            className="min-h-[52px] bg-canvas font-mono text-micro uppercase tracking-[0.14em] text-dim [touch-action:manipulation]"
          >
            Start over
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="min-h-[52px] bg-gold font-mono text-micro font-bold uppercase tracking-[0.14em] text-canvas [touch-action:manipulation]"
          >
            Log it · +{XP_NUTRITION_LOG} XP
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'confirm' || phase === 'estimating') {
    return (
      <section className="border border-edge bg-surface">
        <div className="border-b border-edge px-3 py-2">
          <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
            {'>>'} Heard
          </span>
        </div>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          aria-label="What you said — edit if it got it wrong"
          className="w-full resize-none bg-canvas px-3 py-2.5 font-mono text-read leading-relaxed text-phosphor outline-none focus:ring-2 focus:ring-gold"
        />
        {note ? (
          <p className="border-t border-edge px-3 py-2 font-mono text-read text-dim">{note}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-px bg-edge">
          <button
            type="button"
            onClick={() => {
              setPhase('idle');
              setTranscript('');
            }}
            className="min-h-11 bg-canvas font-mono text-micro uppercase tracking-[0.14em] text-dim [touch-action:manipulation]"
          >
            Redo
          </button>
          <button
            type="button"
            disabled={phase === 'estimating'}
            onClick={() => void estimate()}
            className="min-h-11 bg-gold font-mono text-micro font-bold uppercase tracking-[0.14em] text-canvas [touch-action:manipulation] disabled:opacity-50"
          >
            {phase === 'estimating' ? 'Working…' : 'Estimate it'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="border border-edge bg-surface">
      <div className="px-3 py-2.5">
        <div className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
          {'>>'} No photo? Say it instead
        </div>
        <p className="mt-1.5 font-mono text-read text-phosphor">
          What did you eat, and roughly how much?
        </p>
      </div>

      {recording ? (
        <div className="border-t border-edge px-3 pt-2">
          <div className="h-1.5 w-full bg-edge" aria-hidden>
            <div
              className="h-full bg-fight transition-[width] duration-100"
              style={{ width: `${Math.max(4, level * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex items-baseline justify-between font-mono text-micro uppercase text-dim">
            <span>Recording</span>
            <span className="telemetry">
              {(elapsedMs / 1000).toFixed(1)}s / {MAX_RECORDING_MS / 1000}s
            </span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={phase === 'transcribing' || blocked}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          void start();
        }}
        onPointerUp={() => void release()}
        onPointerCancel={() => cancel()}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'flex min-h-[60px] w-full select-none items-center justify-center gap-2 border-t border-edge font-mono text-data font-bold uppercase tracking-[0.14em] [touch-action:manipulation]',
          recording ? 'bg-fight text-canvas' : 'bg-canvas text-gold',
          (phase === 'transcribing' || blocked) && 'opacity-50',
        )}
      >
        {recording ? <Square size={16} /> : <Mic size={16} />}
        {phase === 'transcribing'
          ? 'Transcribing…'
          : recording
            ? 'Release when done'
            : 'Hold to describe'}
      </button>

      {blocked || note || error ? (
        <>
          <HazardBar tone="gold" />
          <p className="px-3 py-2 font-mono text-read text-dim">
            {error || note}
          </p>
        </>
      ) : null}
    </section>
  );
}
