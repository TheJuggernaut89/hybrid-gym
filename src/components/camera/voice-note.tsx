'use client';

import { useState } from 'react';
import { Mic, Square, RotateCcw } from 'lucide-react';
import { useRecorder } from './use-recorder';
import { HazardBar } from '@/components/ui/industrial';
import {
  MAX_RECORDING_MS,
  PORTION_HINTS,
  usableTranscript,
  type VoicePrompt,
} from '@/lib/voice';
import { cn } from '@/lib/utils';

/**
 * Hold-to-talk portion note.
 *
 * The framing is deliberate and load-bearing: this never says "describe your
 * meal". Vision already names the dish well. It asks the one thing a flat
 * photograph cannot answer — how much — because portion is the dominant error
 * term in image-based macro estimation, and spoken portions measurably beat
 * visual ones.
 *
 * The transcript is always shown before it is used. Code-switched Manglish
 * transcribes badly, and silently feeding a garbled note into a health-adjacent
 * estimate is exactly the failure mode to avoid.
 */
export function VoiceNote({
  prompt,
  onTranscript,
  busy,
}: {
  prompt: VoicePrompt;
  onTranscript: (text: string) => void;
  busy: boolean;
}) {
  const { state, error, level, elapsedMs, start, stop, cancel } = useRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [note, setNote] = useState('');

  const recording = state === 'recording';
  const blocked = state === 'denied' || state === 'unsupported';
  const pct = Math.min(100, (elapsedMs / MAX_RECORDING_MS) * 100);

  async function release() {
    const rec = await stop();
    if (!rec) {
      setNote('Too short — hold the button while you speak.');
      return;
    }

    setTranscribing(true);
    setNote('');
    try {
      const body = new FormData();
      body.append('audio', rec.blob, `note.${rec.extension}`);
      const res = await fetch('/api/transcribe', { method: 'POST', body });
      const json = (await res.json()) as
        | { status: 'success'; transcript: string; source: string }
        | { status: 'error'; message: string };

      if (json.status === 'error') {
        setNote(json.message);
        return;
      }
      if (!usableTranscript(json.transcript)) {
        setNote('Could not make that out. Try again, or just edit the numbers.');
        return;
      }
      setTranscript(json.transcript);
    } catch {
      setNote('Could not reach transcription. Edit the numbers instead.');
    } finally {
      setTranscribing(false);
    }
  }

  if (transcript) {
    return (
      <section className="border border-edge bg-surface">
        <div className="border-b border-edge px-3 py-2">
          <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
            {'>>'} Heard
          </span>
        </div>
        {/* Editable, because transcription of Manglish gets things wrong and the
            fighter is the only one who knows what they actually said. */}
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          aria-label="Transcript of your voice note — edit if it got it wrong"
          className="w-full resize-none bg-canvas px-3 py-2.5 font-mono text-read leading-relaxed text-phosphor outline-none focus:ring-2 focus:ring-gold"
        />
        <div className="grid grid-cols-2 gap-px bg-edge">
          <button
            type="button"
            onClick={() => {
              setTranscript('');
              setNote('');
            }}
            className="flex min-h-11 items-center justify-center gap-1.5 bg-canvas font-mono text-micro uppercase tracking-[0.14em] text-dim [touch-action:manipulation] hover:text-phosphor"
          >
            <RotateCcw size={13} />
            Redo
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onTranscript(transcript.trim())}
            className="flex min-h-11 items-center justify-center bg-gold font-mono text-micro font-bold uppercase tracking-[0.14em] text-canvas [touch-action:manipulation] disabled:opacity-50"
          >
            {busy ? 'Re-estimating…' : 'Use this'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="border border-edge bg-surface">
      {prompt.proactive ? <HazardBar tone="gold" /> : null}

      <div className="px-3 py-2.5">
        <div className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
          {'>>'} Portion check
        </div>
        <p className="mt-1.5 font-sans text-read text-phosphor">
          {prompt.ask}
        </p>
      </div>

      {/* Seeds the vocabulary — people don't say "one palm of chicken" unless
          you show them that's the expected unit. */}
      <dl className="grid grid-cols-2 gap-px border-t border-edge bg-edge">
        {PORTION_HINTS.map((h) => (
          <div key={h.unit} className="bg-canvas px-2.5 py-1.5">
            <dt className="font-mono text-micro uppercase tracking-[0.14em] text-gold">
              {h.unit}
            </dt>
            <dd className="font-mono text-micro text-dim">{h.means}</dd>
          </div>
        ))}
      </dl>

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
          <div className="mt-1 h-px w-full bg-edge" aria-hidden>
            <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={transcribing || busy || blocked}
        // Pointer events rather than mouse/touch pairs: one code path, and
        // pointercancel is what actually fires when a scroll steals the gesture.
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
          (transcribing || busy || blocked) && 'opacity-50',
        )}
      >
        {recording ? <Square size={16} /> : <Mic size={16} />}
        {transcribing
          ? 'Transcribing…'
          : recording
            ? 'Release to send'
            : 'Hold to speak'}
      </button>

      {blocked || note || error ? (
        <p className="border-t border-edge px-3 py-2 font-sans text-read text-dim">
          {error || note}
        </p>
      ) : (
        <p className="border-t border-edge px-3 py-2 font-sans text-read text-dim">
          Optional. Skip it and edit the numbers by hand if you&rsquo;d rather not talk.
        </p>
      )}
    </section>
  );
}
