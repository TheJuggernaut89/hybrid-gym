'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, ImageUp, RotateCcw, WifiOff, Zap } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { SegmentMeter } from '@/components/ui/industrial';
import { ScreenNotice } from '@/components/health/screen-notice';
import { VoiceNote } from '@/components/camera/voice-note';
import { screen } from '@/lib/contraindications';
import { voicePrompt } from '@/lib/voice';
import { useCamera, fileToBase64Jpeg } from '@/components/camera/use-camera';
import { saveEquipmentLog, saveNutritionLog } from '@/app/actions/workout';
import { XP_NUTRITION_LOG, xpFromOcr } from '@/lib/xp';
import { cn } from '@/lib/utils';
import type {
  EquipmentOcrData,
  NutritionVisionData,
  VisionEnvelope,
} from '@/lib/types';

type Mode = 'equipment_ocr' | 'nutrition_vision';
type Phase = 'capture' | 'analyzing' | 'review' | 'saved';

const SPRING = { type: 'spring' as const, stiffness: 460, damping: 32 };

export function ScannerClient({
  lockedMode,
  conditions = [],
}: { lockedMode?: Mode; conditions?: string[] } = {}) {
  // When a route owns a single capture type (FUEL logs meals, GYM reads
  // consoles) the mode toggle is noise — lock it and hide the switch.
  const [mode, setMode] = useState<Mode>(lockedMode ?? 'equipment_ocr');
  const [phase, setPhase] = useState<Phase>('capture');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);

  const [ocr, setOcr] = useState<EquipmentOcrData | null>(null);
  const [nutrition, setNutrition] = useState<NutritionVisionData | null>(null);
  const [coachLine, setCoachLine] = useState('');
  const [source, setSource] = useState<'live' | 'mock'>('live');
  const [saveNote, setSaveNote] = useState('');
  const [transcript, setTranscript] = useState('');
  const [reestimating, setReestimating] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  /** The captured frame, kept so a voice note can re-run it without re-shooting. */
  const shotRef = useRef<string | null>(null);
  const {
    videoRef,
    state,
    error: camError,
    start,
    stop,
    capture,
    quality,
  } = useCamera({ analyseQuality: true });

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  function reset() {
    setPhase('capture');
    setPreview(null);
    setOcr(null);
    setNutrition(null);
    setCoachLine('');
    setError('');
    setSaveNote('');
    setTranscript('');
    shotRef.current = null;
  }

  async function analyze(base64: string, dataUrl: string, spoken = '') {
    setPreview(dataUrl);
    // Keep the frame: a voice note re-runs the SAME photo with a portion
    // stated, so the fighter never has to re-shoot a plate they already ate.
    shotRef.current = base64;
    setPhase('analyzing');
    setError('');
    stop();

    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          imageBase64: base64,
          mimeType: 'image/jpeg',
          ...(spoken ? { transcript: spoken } : {}),
        }),
      });

      const payload = (await res.json()) as
        | VisionEnvelope<EquipmentOcrData | NutritionVisionData>
        | { status: 'error'; message: string };

      if (!res.ok || payload.status === 'error') {
        setError('message' in payload ? payload.message : 'Vision failed.');
        setPhase('capture');
        return;
      }

      setSource(payload.source ?? 'live');
      setCoachLine(payload.roast_or_hype);
      if (payload.type === 'equipment_ocr') setOcr(payload.data as EquipmentOcrData);
      else setNutrition(payload.data as NutritionVisionData);
      if (spoken) setTranscript(spoken);
      setPhase('review');
    } catch {
      setError('Network dropped mid-scan. Gym Mode needs internet.');
      setPhase(spoken ? 'review' : 'capture');
    }
  }

  /** Re-runs the stored frame with a spoken portion attached. */
  async function reestimate(spoken: string) {
    const base64 = shotRef.current;
    if (!base64 || !preview) return;
    setReestimating(true);
    try {
      await analyze(base64, preview, spoken);
    } finally {
      setReestimating(false);
    }
  }

  function onShutter() {
    const shot = capture();
    if (!shot) {
      setError('Could not grab a frame. Use the upload button.');
      return;
    }
    void analyze(shot.base64, shot.dataUrl);
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const shot = await fileToBase64Jpeg(file);
      void analyze(shot.base64, shot.dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  async function confirm() {
    setPhase('analyzing');
    const result =
      mode === 'equipment_ocr' && ocr
        ? await saveEquipmentLog(ocr, coachLine)
        : nutrition
          ? await saveNutritionLog(nutrition, coachLine)
          : { ok: false, message: 'Nothing to save.' };

    setSaveNote(result.message);
    setPhase(result.ok ? 'saved' : 'review');
    if (!result.ok) setError(result.message);
  }

  const isNutrition = mode === 'nutrition_vision';

  // The vision model has no idea what this fighter declared at induction, so
  // everything it produces — the dish, the plate contents, and above all the
  // free-text coach line — gets screened before it is rendered. This is the
  // guardrail on the LLM, not on the fighter.
  const flags = screen({
    conditions,
    subjects: [
      coachLine,
      // The transcript is screened too: "had it with lime" spoken aloud must
      // raise the same reflux flag as the model writing it.
      transcript,
      nutrition?.dish_name ?? '',
      nutrition?.portion_note ?? '',
      nutrition?.portion_basis ?? '',
      ...(nutrition?.items ?? []),
    ].filter(Boolean),
  });

  const xpPreview =
    mode === 'equipment_ocr' && ocr
      ? xpFromOcr({ activeMinutes: ocr.active_minutes })
      : XP_NUTRITION_LOG;

  return (
    <div className="space-y-3">
      {/* ─ mode switch ─ */}
      {lockedMode ? null : (
      <div className="grid grid-cols-2 gap-px border border-edge bg-edge">
        {(
          [
            ['equipment_ocr', 'LOOT', 'Equipment OCR'],
            ['nutrition_vision', 'FUEL', 'Nutrition Vision'],
          ] as const
        ).map(([value, label, sub]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              reset();
            }}
            className={cn(
              'px-3 py-2.5 text-left transition-colors duration-100',
              mode === value ? 'bg-gold text-canvas' : 'bg-canvas text-dim',
            )}
          >
            <span className="block text-h3 leading-none display">{label}</span>
            <span className="block font-mono text-micro tracking-[0.15em] opacity-70">{sub}</span>
          </button>
        ))}
      </div>
      )}

      {!online ? (
        <div className="flex items-start gap-2 border border-fight bg-fight/10 p-3">
          <WifiOff size={15} className="mt-0.5 shrink-0 text-fight" />
          <p className="font-sans text-read text-fight">
            OFFLINE. Gym Mode runs server-side vision and needs a connection. The Shadow
            Dojo still works on-device.
          </p>
        </div>
      ) : null}

      {/* Each phase mounts fresh and plays its entrance. No AnimatePresence:
          nothing here needs an exit animation, and depending on one risks
          stranding a phase mid-transition. */}
      {/* ─────────── CAPTURE ─────────── */}
      {phase === 'capture' && (
          <motion.div
            key="capture"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="space-y-3"
          >
            <Panel brackets className="overflow-hidden">
              <div className="relative aspect-[3/4] bg-black">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={cn(
                    'h-full w-full object-cover',
                    state === 'live' ? 'opacity-100' : 'opacity-0',
                  )}
                />

                {/* viewfinder overlay */}
                {state === 'live' ? (
                  <>
                    <div className="pointer-events-none absolute inset-6 border border-gold/40">
                      <span className="absolute -left-px -top-px h-4 w-4 border-l-2 border-t-2 border-gold" />
                      <span className="absolute -right-px -top-px h-4 w-4 border-r-2 border-t-2 border-gold" />
                      <span className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-gold" />
                      <span className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-gold" />
                    </div>
                    <div className="pointer-events-none absolute inset-x-6 top-6 h-px animate-sweep bg-gold/70" />

                    {/* Live on-device scoring. No network, no API cost — this is
                        why the shutter can be gated without a round trip. */}
                    <div className="pointer-events-none absolute inset-x-6 bottom-6 space-y-1 border border-edge bg-canvas/85 p-2">
                      <QualityRow label="Focus" value={quality.sharpness} />
                      <QualityRow label="Light" value={quality.brightness} />
                      <QualityRow label="Frame" value={quality.fill} />
                    </div>

                    {/* Backing plate: this sits over arbitrary camera footage,
                        so it cannot rely on the scene for contrast. */}
                    <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
                      <p
                        className={cn(
                          'border bg-canvas/90 px-2 py-1 font-mono text-micro',
                          quality.ready
                            ? 'border-engage text-engage'
                            : 'border-edge text-gold',
                        )}
                      >
                        {quality.ready
                          ? '>>> TARGET LOCKED <<<'
                          : mode === 'equipment_ocr'
                            ? 'FILL THE FRAME WITH THE CONSOLE'
                            : 'ONE PLATE, TOP-DOWN, GOOD LIGHT'}
                      </p>
                    </div>
                  </>
                ) : (
                  /* Idle sensor frame. An empty black box with a centred icon
                     reads as broken; a framed standby state reads as armed. */
                  <div className="absolute inset-0">
                    <div className="pointer-events-none absolute inset-4 border border-edge">
                      <span className="absolute -left-px -top-px h-4 w-4 border-l-2 border-t-2 border-edgeBright" />
                      <span className="absolute -right-px -top-px h-4 w-4 border-r-2 border-t-2 border-edgeBright" />
                      <span className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-edgeBright" />
                      <span className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-edgeBright" />
                    </div>

                    {/* centre reticle */}
                    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-faint">
                      <svg width="54" height="54" viewBox="0 0 54 54" fill="none" aria-hidden>
                        <path d="M27 0v16M27 38v16M0 27h16M38 27h16" stroke="currentColor" strokeWidth="1" />
                        <rect x="20" y="20" width="14" height="14" stroke="currentColor" strokeWidth="1" />
                      </svg>
                    </div>

                    <dl className="absolute left-6 top-6 space-y-1 font-mono text-micro uppercase">
                      <div className="flex gap-2">
                        <dt className="text-faint">Sensor</dt>
                        <dd className={state === 'starting' ? 'text-gold' : 'text-dim'}>
                          {state === 'starting' ? 'Spinning up' : 'Standby'}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-faint">Mode</dt>
                        <dd className="text-dim">
                          {mode === 'equipment_ocr' ? 'Equipment OCR' : 'Nutrition'}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-faint">Link</dt>
                        <dd className={online ? 'text-engage' : 'text-fight'}>
                          {online ? 'Online' : 'Offline'}
                        </dd>
                      </div>
                    </dl>

                    <p className="absolute inset-x-6 bottom-6 font-mono text-meta uppercase text-dim">
                      {state === 'starting'
                        ? 'Opening camera…'
                        : camError || 'Camera offline. Arm the sensor or upload a frame.'}
                    </p>
                  </div>
                )}
              </div>
            </Panel>

            {error ? (
              <p className="border-l-2 border-fight pl-2 font-sans text-read text-fight">
                {error}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              {state === 'live' ? (
                /* Soft gate, not a hard block: a bad score dims the shutter and
                   renames it, but the fighter can always override. Odd lighting
                   on a gym floor shouldn't lock them out of logging a set. */
                <Button
                  onClick={onShutter}
                  variant={quality.ready ? 'gold' : 'ghost'}
                  className="col-span-2 py-4 text-read"
                >
                  <Zap size={16} />
                  {quality.ready ? 'CAPTURE' : 'CAPTURE ANYWAY'}
                </Button>
              ) : (
                <Button onClick={start} className="col-span-2 py-4 text-read">
                  <Camera size={16} />
                  START CAMERA
                </Button>
              )}
              <Button variant="ghost" onClick={() => fileRef.current?.click()} className="col-span-2">
                <ImageUp size={14} />
                UPLOAD A PHOTO
              </Button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={onFile}
              className="hidden"
            />
          </motion.div>
        )}

        {/* ─────────── ANALYZING ─────────── */}
        {phase === 'analyzing' && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border border-gold bg-surface p-6 text-center"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Captured frame"
                className="mx-auto mb-4 max-h-40 border border-edge object-contain opacity-60"
              />
            ) : null}
            <motion.div
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              className="text-h2 text-gold"
            >
              PARSING…
            </motion.div>
            <p className="mt-1 font-sans text-read tracking-[0.2em] text-dim">
              READING TELEMETRY
            </p>
          </motion.div>
        )}

        {/* ─────────── REVIEW ─────────── */}
        {phase === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="space-y-3"
          >
            {ocr && mode === 'equipment_ocr' ? (
              <EquipmentReview data={ocr} onChange={setOcr} source={source} />
            ) : null}
            {nutrition && mode === 'nutrition_vision' ? (
              <NutritionReview data={nutrition} onChange={setNutrition} source={source} />
            ) : null}

            {/* Sits directly under the numbers it exists to correct. Portion is
                the dominant error term in any photo estimate, so this is the
                highest-value thing on the review screen — not a footnote. */}
            {nutrition && mode === 'nutrition_vision' && !transcript ? (
              <VoiceNote
                prompt={voicePrompt(nutrition)}
                onTranscript={(t) => void reestimate(t)}
                busy={reestimating}
              />
            ) : null}

            {/* Above the coach line on purpose. If the model suggested
                something that collides with a declared condition, the fighter
                must read the flag before they read the suggestion. */}
            <ScreenNotice flags={flags} />

            {coachLine ? (
              <Panel>
                <PanelHeader label="COACH" accent="fight" />
                <p className="p-3 font-sans text-read italic text-phosphor">
                  &ldquo;{coachLine}&rdquo;
                </p>
              </Panel>
            ) : null}

            <div className="flex items-center justify-between border border-gold bg-gold/10 px-3 py-2.5">
              <span className="font-mono text-meta tracking-[0.2em] text-gold">XP ON CONFIRM</span>
              <span className="telemetry font-mono text-h2 font-bold text-gold">+{xpPreview}</span>
            </div>

            {error ? (
              <p className="border-l-2 border-fight pl-2 font-sans text-read text-fight">{error}</p>
            ) : null}

            <div className="grid grid-cols-3 gap-2">
              <Button variant="ghost" onClick={reset}>
                <RotateCcw size={14} />
                REDO
              </Button>
              <Button variant="engage" onClick={confirm} className="col-span-2">
                {isNutrition ? 'LOG THIS MEAL' : 'BANK THE LOOT'}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─────────── SAVED ─────────── */}
        {phase === 'saved' && (
          <motion.div
            key="saved"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING}
            className="border border-engage bg-surface p-6 text-center"
          >
            <div className="text-h1 text-engage">+{xpPreview} XP</div>
            <p className="mt-2 font-sans text-read text-dim">{saveNote}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={reset}>
                {isNutrition ? 'LOG ANOTHER' : 'SCAN AGAIN'}
              </Button>
              <Button onClick={() => (window.location.href = isNutrition ? '/fuel' : '/hud')}>
                {isNutrition ? "BACK TO TODAY" : 'BACK TO HUD'}
              </Button>
            </div>
          </motion.div>
        )}
    </div>
  );
}

/** One live metric bar in the viewfinder overlay. */
function QualityRow({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? 'engage' : value >= 45 ? 'gold' : 'fight';
  const text =
    tone === 'engage' ? 'text-engage' : tone === 'gold' ? 'text-gold' : 'text-fight';

  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 font-mono text-micro uppercase text-faint">{label}</span>
      <SegmentMeter pct={value} segments={12} tone={tone} className="h-1.5 flex-1" />
      <span className={cn('telemetry w-6 shrink-0 text-right font-mono text-micro', text)}>
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────── review panels ─────────────────────────── */

function SourceTag({ source }: { source: 'live' | 'mock' }) {
  return (
    <span
      className={cn(
        'border px-1 py-0.5 font-mono text-micro tracking-[0.15em]',
        source === 'mock' ? 'border-fight text-fight' : 'border-engage text-engage',
      )}
    >
      {source === 'mock' ? 'MOCK DATA' : 'VISION'}
    </span>
  );
}

function NumberField({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number | null;
  unit?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block border border-edge bg-canvas px-3 py-2">
      <span className="block font-mono text-micro uppercase tracking-[0.2em] text-dim">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <input
          value={value ?? ''}
          inputMode="decimal"
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, '');
            onChange(raw === '' ? null : Number(raw));
          }}
          className="telemetry w-full bg-transparent font-mono text-h3 font-bold text-gold outline-none placeholder:text-faint"
        />
        {unit ? <span className="shrink-0 font-mono text-meta text-faint">{unit}</span> : null}
      </span>
    </label>
  );
}

function EquipmentReview({
  data,
  onChange,
  source,
}: {
  data: EquipmentOcrData;
  onChange: (d: EquipmentOcrData) => void;
  source: 'live' | 'mock';
}) {
  return (
    <Panel>
      <PanelHeader
        label={data.equipment_type.replace(/_/g, ' ')}
        right={<SourceTag source={source} />}
      />
      <div className="grid grid-cols-2 gap-px bg-edge p-px">
        <NumberField
          label="Calories"
          value={data.calories}
          unit="KCAL"
          onChange={(v) => onChange({ ...data, calories: v })}
        />
        <NumberField
          label="Active Time"
          value={data.active_minutes}
          unit="MIN"
          onChange={(v) => onChange({ ...data, active_minutes: v })}
        />
        <NumberField
          label="Distance"
          value={data.distance_m}
          unit="M"
          onChange={(v) => onChange({ ...data, distance_m: v })}
        />
        <Stat label="Console Time" value={data.time_display ?? '—'} accent="neutral" />
      </div>
      <div className="border-t border-edge px-3 py-2">
        <p className="font-sans text-read text-dim">
          CONFIDENCE <span className="text-phosphor">{data.confidence.toUpperCase()}</span>
          {data.unreadable_fields.length > 0 ? (
            <>
              {' · '}
              <span className="text-fight">
                UNREADABLE: {data.unreadable_fields.join(', ')}
              </span>
            </>
          ) : null}
          <br />
          Numbers are editable — if the console glared, correct it before banking.
        </p>
      </div>
    </Panel>
  );
}

function NutritionReview({
  data,
  onChange,
  source,
}: {
  data: NutritionVisionData;
  onChange: (d: NutritionVisionData) => void;
  source: 'live' | 'mock';
}) {
  return (
    <Panel>
      <PanelHeader label={data.dish_name} right={<SourceTag source={source} />} />
      <div className="grid grid-cols-2 gap-px bg-edge p-px">
        <NumberField
          label="Calories"
          value={data.calories}
          unit="KCAL"
          onChange={(v) => onChange({ ...data, calories: v })}
        />
        <NumberField
          label="Protein"
          value={data.protein_g}
          unit="G"
          onChange={(v) => onChange({ ...data, protein_g: v })}
        />
        <NumberField
          label="Carbs"
          value={data.carbs_g}
          unit="G"
          onChange={(v) => onChange({ ...data, carbs_g: v })}
        />
        <NumberField
          label="Fats"
          value={data.fats_g}
          unit="G"
          onChange={(v) => onChange({ ...data, fats_g: v })}
        />
      </div>
      <div className="border-t border-edge px-3 py-2">
        <p className="font-sans text-read text-dim">
          {data.portion_note}
        </p>
        {data.items.length > 0 ? (
          <p className="mt-1.5 font-sans text-read text-dim">
            ON THE PLATE: {data.items.join(' · ')}
          </p>
        ) : null}
        {/* Where the portion number came from is the single most useful thing
            to disclose here — it is the weakest part of any photo estimate. */}
        {data.portion_basis ? (
          <p className="mt-1.5 font-sans text-read text-dim">
            <span className="text-gold">PORTION BASIS</span> {data.portion_basis}
            {data.stated_confidence === 'unsure' ? ' · they said they were unsure' : ''}
          </p>
        ) : null}
        <p className="mt-1.5 font-sans text-read text-dim">
          CONFIDENCE <span className="text-dim">{data.confidence.toUpperCase()}</span> ·
          Estimates for training feedback, not clinical advice.
        </p>
      </div>
    </Panel>
  );
}
