'use client';

import { useState, useTransition } from 'react';
import { Check, ScanLine } from 'lucide-react';
import {
  RPE_ANCHORS,
  sessionTypeFor,
  SESSION_TYPES,
  anchorFor,
  sessionLoad,
  type SessionType,
} from '@/lib/session';
import { logSession } from '@/app/actions/session';
import { ConsoleScan } from '@/components/camera/console-scan';
import { HazardBar } from '@/components/ui/industrial';
import { cn } from '@/lib/utils';

/**
 * Quick-log.
 *
 * The point of this screen is that it works for EVERY member. Before it
 * existed the app could only see a cardio console it could OCR and a solo
 * drill done at home, so the weights floor, every class, and the mats trained
 * invisibly — earning nothing, and (because macro targets read session count)
 * being fed as if sedentary.
 *
 * Three taps: what, how long, how hard. Duration and RPE are pre-filled from
 * the modality, so the common case is type -> confirm.
 */
export interface LogPrefill {
  /** SESSION_TYPES id, chosen by the plan. */
  sessionType: string;
  /** e.g. "Leg day" — carried through so the session is named, not just typed. */
  label?: string;
}

export function LogClient({
  prefill,
  onDone,
}: {
  prefill?: LogPrefill | null;
  onDone?: () => void;
} = {}) {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<SessionType | null>(
    prefill ? sessionTypeFor(prefill.sessionType) : null,
  );
  const [minutes, setMinutes] = useState(
    (prefill ? sessionTypeFor(prefill.sessionType)?.defaultMin : null) ?? 60,
  );
  const [rpe, setRpe] = useState(6);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');

  function pick(t: SessionType) {
    setType(t);
    setMinutes(t.defaultMin);
    setNote('');
    setScanNote('');
    setScanning(false);
    setDone(false);
  }

  function submit() {
    if (!type) return;
    startTransition(async () => {
      const r = await logSession({
        sessionType: type.id,
        durationMin: minutes,
        rpe,
        label: prefill?.label,
      });
      setNote(r.message);
      setDone(r.ok);
    });
  }

  const load = sessionLoad(minutes, rpe);
  const anchor = anchorFor(rpe);

  if (done) {
    return (
      <div className="space-y-3">
        <section className="border border-engage bg-surface">
          <div className="flex items-center gap-2 border-b border-edge px-3 py-2.5">
            <Check size={14} className="text-engage" />
            <span className="font-mono text-micro uppercase tracking-[0.18em] text-engage">
              Logged
            </span>
          </div>
          <p className="px-3 py-2.5 font-sans text-read text-phosphor">{note}</p>
        </section>
        <button
          type="button"
          onClick={() => {
            setType(null);
            setDone(false);
            setNote('');
          }}
          className="min-h-11 w-full border border-edge bg-canvas font-mono text-micro uppercase tracking-[0.14em] text-gold [touch-action:manipulation]"
        >
          Log another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── 1. what ───────────────────────────────────────────────────── */}
      <section className="border border-edge bg-surface">
        <div className="border-b border-edge px-3 py-2">
          <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
            {'>>'} 01 / What was it
          </span>
        </div>
        <ul className="rule-grid grid-cols-2">
          {SESSION_TYPES.map((t, i) => (
            <li
              key={t.id}
              className={cn(
                'bg-canvas',
                // An odd count leaves a dead cell in a two-column grid; the
                // last tile takes the full row instead.
                i === SESSION_TYPES.length - 1 &&
                  SESSION_TYPES.length % 2 === 1 &&
                  'col-span-2',
              )}
            >
              <button
                type="button"
                onClick={() => pick(t)}
                aria-pressed={type?.id === t.id}
                className={cn(
                  'flex min-h-[58px] w-full flex-col justify-center px-2.5 py-2 text-left [touch-action:manipulation]',
                  type?.id === t.id ? 'bg-gold text-canvas' : 'hover:bg-gold/5',
                )}
              >
                <span
                  className={cn(
                    'font-mono text-data font-bold uppercase tracking-[0.12em]',
                    type?.id === t.id ? 'text-canvas' : 'text-phosphor',
                  )}
                >
                  {t.label}
                </span>
                <span
                  className={cn(
                    'font-mono text-micro leading-tight',
                    type?.id === t.id ? 'text-canvas/80' : 'text-dim',
                  )}
                >
                  {t.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {type ? (
        <>
          {/* Console OCR lives here now rather than as its own tab: the only
              thing it uniquely produced was a calorie figure, and calories no
              longer drive scoring. Reading the elapsed time off a display is
              the one job still worth a camera. */}
          {scanning ? (
            <ConsoleScan
              onClose={() => setScanning(false)}
              onMinutes={(m, label) => {
                setMinutes(Math.min(180, Math.max(5, m)));
                setScanNote(`Read ${m} min off the ${label}. Set the effort below.`);
                setScanning(false);
              }}
            />
          ) : null}

          {/* ── 2. how long ─────────────────────────────────────────────── */}
          <section className="border border-edge bg-surface">
            <div className="flex items-baseline justify-between border-b border-edge px-3 py-2">
              <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
                {'>>'} 02 / How long
              </span>
              <span className="telemetry font-mono text-data font-bold text-phosphor">
                {minutes} MIN
              </span>
            </div>

            {type.id === 'conditioning' && !scanning ? (
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 border-b border-edge bg-canvas font-mono text-micro uppercase tracking-[0.14em] text-gold [touch-action:manipulation]"
              >
                <ScanLine size={13} />
                Scan the console instead
              </button>
            ) : null}

            {scanNote ? (
              <p className="border-b border-edge px-3 py-2 font-sans text-read text-engage">
                {scanNote}
              </p>
            ) : null}
            <div className="px-3 py-3">
              <input
                type="range"
                min={5}
                max={180}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                aria-label="Session duration in minutes"
                className="h-11 w-full accent-gold [touch-action:manipulation]"
              />
              <div className="flex justify-between font-mono text-micro text-dim">
                <span>5</span>
                <span>180</span>
              </div>
            </div>
          </section>

          {/* ── 3. how hard ─────────────────────────────────────────────────
              RPE is the whole reason this app can compare a lift to a spin
              class. Members rate far more consistently against words than
              numbers, so the anchor is the label and the number is secondary. */}
          <section className="border border-edge bg-surface">
            <div className="flex items-baseline justify-between border-b border-edge px-3 py-2">
              <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
                {'>>'} 03 / How hard
              </span>
              <span className="telemetry font-mono text-data font-bold text-phosphor">
                {anchor.word} · {rpe}
              </span>
            </div>
            <div className="px-3 py-3">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={rpe}
                onChange={(e) => setRpe(Number(e.target.value))}
                aria-label={`Effort, 1 to 10. Currently ${rpe}, ${anchor.word}`}
                className="h-11 w-full accent-gold [touch-action:manipulation]"
              />
              <p className="font-sans text-read text-dim">{anchor.feel}</p>
              <dl className="mt-2 grid grid-cols-5 gap-px bg-edge">
                {RPE_ANCHORS.map((a) => (
                  <div key={a.rpe} className="bg-canvas px-1 py-1 text-center">
                    <dt className="font-mono text-micro text-faint">{a.rpe}</dt>
                    <dd className="font-mono text-micro uppercase leading-tight text-dim">
                      {a.word}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* ── confirm ─────────────────────────────────────────────────── */}
          <section className="border border-edge bg-surface">
            <div className="flex items-baseline justify-between px-3 py-2.5">
              <span className="font-mono text-micro uppercase text-faint">Session load</span>
              <span className="telemetry display text-h3 text-gold">{load} AU</span>
            </div>
            {note && !done ? (
              <>
                <HazardBar />
                <p className="px-3 py-2 font-sans text-read text-phosphor">
                  {note}
                </p>
              </>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="min-h-[60px] w-full border-t border-edge bg-gold font-mono text-data font-bold uppercase tracking-[0.14em] text-canvas [touch-action:manipulation] disabled:opacity-50"
            >
              {pending ? 'Logging…' : `Log ${type.label}`}
            </button>
          </section>
        </>
      ) : null}
    </div>
  );
}
