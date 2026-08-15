'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, Check, Play, Square, Timer } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Meter, Stat } from '@/components/ui/stat';
import { AnatomyMap, AnatomyLegend } from '@/components/body/anatomy-map';
import { ScreenNotice } from '@/components/health/screen-notice';
import { screen } from '@/lib/contraindications';
import { SkeletonOverlay } from '@/components/dojo/skeleton-overlay';
import { usePoseTracker } from '@/components/dojo/use-pose-tracker';
import { useCamera } from '@/components/camera/use-camera';
import { DRILLS, newRuntime, type Drill, type DrillRuntime } from '@/lib/drills';
import { REGION_LABEL, type RegionId } from '@/lib/anatomy';
import { classify, correctiveFor, verdictCopy, type Corrective } from '@/lib/corrective';
import { saveHomeSession } from '@/app/actions/home';
import { xpFromHome } from '@/lib/xp';
import {
  cuePolicy,
  newProgress,
  STAGE_META,
  type LadderStage,
  type TechniqueProgress,
} from '@/lib/ladder';
import { formatDuration, cn } from '@/lib/utils';
import type { Landmark } from '@/lib/pose';

type Phase = 'select' | 'setup' | 'live' | 'postcheck' | 'corrective' | 'done';

const SPRING = { type: 'spring' as const, stiffness: 460, damping: 32 };

interface LadderOutcome {
  from: LadderStage;
  to: LadderStage;
  event: string;
  message: string;
  cleanRun: number;
}

export function DojoClient({
  progress,
  conditions = [],
}: {
  progress: Record<string, TechniqueProgress>;
  conditions?: string[];
}) {
  const [phase, setPhase] = useState<Phase>('select');
  const [drill, setDrill] = useState<Drill>(DRILLS[0]);
  const [ladder, setLadder] = useState<LadderOutcome | null>(null);

  // The ladder decides how much the app is allowed to say during this set.
  const stage: LadderStage = progress[drill.id]?.stage ?? newProgress(drill.id).stage;
  const policy = cuePolicy(stage);

  // ─ live session state ─
  const runtimeRef = useRef<DrillRuntime>(newRuntime());
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [score, setScore] = useState(0);
  const [avgScore, setAvgScore] = useState(0);
  const [reps, setReps] = useState(0);
  const [cues, setCues] = useState<string[]>([]);
  const [activeRegions, setActiveRegions] = useState<RegionId[]>([]);
  const [strainRegions, setStrainRegions] = useState<RegionId[]>([]);
  const [flaggedStrain, setFlaggedStrain] = useState<RegionId[]>([]);
  const [remaining, setRemaining] = useState(DRILLS[0].durationSec);
  const [elapsed, setElapsed] = useState(0);

  // ─ post-check state ─
  const [tapped, setTapped] = useState<RegionId[]>([]);
  const [verdictRegion, setVerdictRegion] = useState<RegionId | null>(null);
  const [corrective, setCorrective] = useState<Corrective | null>(null);
  const [correctiveLeft, setCorrectiveLeft] = useState(0);
  const [saveNote, setSaveNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { videoRef, state: camState, error: camError, start: startCam, stop: stopCam } = useCamera({
    facingMode: 'user',
  });

  const onLandmarks = useCallback(
    (lm: Landmark[] | null) => {
      setLandmarks(lm);
      if (!lm) {
        // Tracking loss is a system fault, not coaching — it shows at every rung.
        setCues(['NO POSE DETECTED — STEP INTO FRAME']);
        setScore(0);
        return;
      }

      const rt = runtimeRef.current;
      const result = drill.evaluate(lm, rt);

      // ── the ladder gates what the fighter sees, not what we measure ──────
      // Scoring always runs at full fidelity; only the *display* fades. Strain
      // warnings are exempt at every rung — safety is never faded out.
      const showCues =
        policy.liveCues &&
        (policy.cueThreshold === null || result.score < policy.cueThreshold);

      setCues(showCues ? result.cues : []);
      setActiveRegions(result.active);
      setStrainRegions(result.strain);
      setScore(result.score);

      if (!result.usable) return;

      rt.frames += 1;
      rt.scoreSum += result.score;
      if (result.repDelta) {
        rt.reps += result.repDelta;
        setReps(rt.reps);
      }
      setAvgScore(Math.round(rt.scoreSum / Math.max(rt.frames, 1)));

      if (result.strain.length) {
        setFlaggedStrain((prev) => {
          const next = new Set(prev);
          result.strain.forEach((r) => next.add(r));
          return Array.from(next);
        });
      }
    },
    [drill, policy],
  );

  const tracker = usePoseTracker(videoRef, { onLandmarks });

  // ─ session countdown ─
  useEffect(() => {
    if (phase !== 'live') return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          finish();
          return 0;
        }
        return r - 1;
      });
      setElapsed((e) => e + 1);
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ─ corrective countdown ─
  useEffect(() => {
    if (phase !== 'corrective' || correctiveLeft <= 0) return;
    const id = window.setInterval(() => setCorrectiveLeft((t) => Math.max(0, t - 1)), 1000);
    return () => window.clearInterval(id);
  }, [phase, correctiveLeft]);

  // ─ screen wake lock while drilling ─
  useEffect(() => {
    if (phase !== 'live') return;
    let sentinel: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request('screen')
      .then((s) => {
        sentinel = s;
      })
      .catch(() => {});
    return () => {
      void sentinel?.release().catch(() => {});
    };
  }, [phase]);

  function pickDrill(next: Drill) {
    setDrill(next);
    setRemaining(next.durationSec);
    setPhase('setup');
  }

  async function beginSetup() {
    await startCam();
    await tracker.load();
  }

  function beginDrill() {
    runtimeRef.current = newRuntime();
    setReps(0);
    setAvgScore(0);
    setElapsed(0);
    setFlaggedStrain([]);
    setRemaining(drill.durationSec);
    tracker.start();
    setPhase('live');
  }

  const finish = useCallback(() => {
    tracker.stop();
    stopCam();
    setPhase('postcheck');
  }, [tracker, stopCam]);

  function onTapRegion(region: RegionId) {
    setVerdictRegion(region);
    setTapped((prev) => (prev.includes(region) ? prev : [...prev, region]));
  }

  function queueCorrective(region: RegionId) {
    const c = correctiveFor(region);
    setCorrective(c);
    setCorrectiveLeft(c.durationSec);
    setPhase('corrective');
  }

  async function save(withCorrective: string | null) {
    setSaving(true);
    const accuracy = runtimeRef.current.frames > 0 ? avgScore : 0;
    // Zones the fighter reported, minus those the engine already classes as strain.
    const fatigueZones = tapped.filter((r) => classify(r, drill) === 'fatigue');
    const strainFlags = Array.from(
      new Set([...flaggedStrain, ...tapped.filter((r) => classify(r, drill) === 'failure')]),
    );

    const result = await saveHomeSession({
      drillId: drill.id,
      drillName: drill.name,
      stat: drill.stat,
      repCount: reps,
      durationSeconds: elapsed,
      accuracy,
      fatigueZones,
      strainFlags,
      correctiveAction: withCorrective,
      ladderStage: stage,
    });

    setSaveNote(result.message);
    setLadder(result.ladder ?? null);
    setSaving(false);
    setPhase('done');
  }

  function resetAll() {
    runtimeRef.current = newRuntime();
    setPhase('select');
    setTapped([]);
    setVerdictRegion(null);
    setCorrective(null);
    setFlaggedStrain([]);
    setLandmarks(null);
    setCues([]);
    setSaveNote('');
    setReps(0);
    setAvgScore(0);
    setElapsed(0);
  }

  const xpPreview = useMemo(
    () => xpFromHome({ accuracy: avgScore, durationSeconds: elapsed }),
    [avgScore, elapsed],
  );

  const verdict = verdictRegion ? classify(verdictRegion, drill) : null;

  return (
    <div className="space-y-3">
      {/* Each phase mounts fresh and plays its entrance. No AnimatePresence:
          nothing here needs an exit animation, and depending on one risks
          stranding a phase mid-transition. */}
      {/* ════════════ SELECT ════════════ */}
        {phase === 'select' && (
          <motion.div key="select" {...fade} className="space-y-3">
            <Panel>
              <PanelHeader label="SELECT DRILL" right="ALL UNDER 10 MIN" />
              <ul className="divide-y divide-edge">
                {DRILLS.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => pickDrill(d)}
                      className="w-full p-3 text-left transition-colors hover:bg-gold/5"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-h3 text-phosphor">{d.name}</h3>
                        <span className="telemetry shrink-0 font-mono text-meta text-gold">
                          {formatDuration(d.durationSec)}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <StageBadge stage={progress[d.id]?.stage ?? 'ACQUIRE'} />
                      </div>
                      <p className="mt-1.5 font-mono text-read text-dim">
                        {d.brief}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {d.targets.map((t) => (
                          <span
                            key={t}
                            className="border border-engage/40 px-1 py-0.5 font-mono text-micro tracking-[0.1em] text-engage"
                          >
                            {REGION_LABEL[t].toUpperCase()}
                          </span>
                        ))}
                        {/* A region can be both loaded and watched (shoulders on a
                            jab). Only chip it once, as the warning. */}
                        {d.watch
                          .filter((t) => !d.targets.includes(t))
                          .map((t) => (
                            <span
                              key={`w-${t}`}
                              className="border border-fight/40 px-1 py-0.5 font-mono text-micro tracking-[0.1em] text-fight"
                            >
                              ⚠ {REGION_LABEL[t].toUpperCase()}
                            </span>
                          ))}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>

            <p className="font-mono text-read text-dim">
              Pose tracking runs entirely in your browser. No video leaves this device and
              nothing is uploaded — only the rep count and form score are saved.
            </p>
          </motion.div>
        )}

        {/* ════════════ SETUP ════════════ */}
        {phase === 'setup' && (
          <motion.div key="setup" {...fade} className="space-y-3">
            <Panel brackets>
              <PanelHeader label={drill.name} right={formatDuration(drill.durationSec)} />
              <div className="space-y-3 p-3">
                <p className="font-mono text-read text-phosphor">
                  {drill.brief}
                </p>

                {/* What the coach will and won't say this set. */}
                <div
                  className={cn(
                    'border p-2.5',
                    stage === 'SILENT_PROBE' ? 'border-fight bg-fight/10' : 'border-edge bg-canvas',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <StageBadge stage={stage} />
                    <span className="font-mono text-micro uppercase text-faint">
                      Coaching ladder
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-read text-phosphor">
                    {STAGE_META[stage].cuePolicy}
                  </p>
                  <p className="mt-1 font-mono text-read text-dim">
                    {STAGE_META[stage].blurb}
                  </p>
                </div>
                <div className="border border-edge bg-canvas p-2.5">
                  <div className="font-mono text-micro tracking-[0.2em] text-gold">
                    CAMERA SETUP
                  </div>
                  <p className="mt-1 font-mono text-read text-dim">
                    {drill.cameraNote}
                  </p>
                </div>

                {/* A drill is a physical prescription. Screening food while
                    leaving movement unscreened put the riskier instruction
                    behind the weaker guard. */}
                <ScreenNotice
                  flags={screen({
                    conditions,
                    subjects: [
                      drill.name,
                      drill.brief,
                      ...drill.targets.map((r) => REGION_LABEL[r]),
                      ...drill.watch.map((r) => REGION_LABEL[r]),
                    ],
                  })}
                />

                <div>
                  <div className="mb-1.5 font-mono text-micro tracking-[0.2em] text-dim">
                    MUSCLE MAP
                  </div>
                  <AnatomyMap target={drill.targets} strain={drill.watch} />
                  <div className="mt-2">
                    <AnatomyLegend />
                  </div>
                </div>
              </div>
            </Panel>

            <div className="aspect-[3/4] w-full border border-edge bg-black">
              <div className="relative h-full w-full">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={cn(
                    'h-full w-full scale-x-[-1] object-cover',
                    camState === 'live' ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {camState !== 'live' ? (
                  <div className="absolute inset-0 grid place-items-center px-6 text-center">
                    <p className="font-mono text-read text-dim">
                      {camState === 'starting'
                        ? 'OPENING CAMERA…'
                        : camError || 'Camera off. Arm the dojo to check your framing.'}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {tracker.state === 'error' ? (
              <p className="border-l-2 border-fight pl-2 font-mono text-read text-fight">
                {tracker.error}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={resetAll}>
                BACK
              </Button>
              {camState === 'live' && tracker.state === 'ready' ? (
                <Button variant="engage" onClick={beginDrill}>
                  <Play size={14} />
                  START
                </Button>
              ) : (
                <Button onClick={beginSetup} disabled={tracker.state === 'loading'}>
                  {tracker.state === 'loading' ? 'LOADING ENGINE…' : 'ARM THE DOJO'}
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {/* ════════════ LIVE ════════════ */}
        {phase === 'live' && (
          <motion.div key="live" {...fade} className="space-y-3">
            <div className="relative aspect-[3/4] w-full overflow-hidden border border-edge bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full scale-x-[-1] object-cover opacity-70"
              />
              <SkeletonOverlay
                landmarks={landmarks}
                score={score}
                strain={strainRegions.length > 0}
              />

              {/* HUD overlay */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
                <div className="border border-gold bg-canvas/85 px-2 py-1">
                  <div className="font-mono text-micro tracking-[0.2em] text-dim">
                    TIME LEFT
                  </div>
                  <div className="telemetry font-mono text-h3 font-bold leading-none text-gold">
                    {formatDuration(remaining)}
                  </div>
                </div>
                <div className="border border-edge bg-canvas/85 px-2 py-1 text-right">
                  <div className="font-mono text-micro tracking-[0.2em] text-dim">
                    {drill.mode === 'hold' ? 'HOLDING' : 'REPS'}
                  </div>
                  <div className="telemetry font-mono text-h3 font-bold leading-none text-phosphor">
                    {drill.mode === 'hold' ? formatDuration(elapsed) : reps}
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
                {/* Keyed on the cue text, so a new cue animates in and a cleared
                    one disappears immediately — stale form cues are worse than
                    no cues mid-set. */}
                {cues.slice(0, 2).map((cue) => (
                  <motion.div
                    key={cue}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="mb-1 flex items-center gap-1.5 border border-fight bg-canvas/90 px-2 py-1.5"
                  >
                    <AlertTriangle size={12} className="shrink-0 text-fight" />
                    <span className="font-mono text-meta leading-tight text-fight">{cue}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* During a silent probe the score is hidden too — a visible number
                is itself feedback, and the probe is meant to test retention
                without any. */}
            <div className="rule-grid grid-cols-3 border border-edge">
              {policy.liveScore ? (
                <>
                  <Stat
                    label="Form Now"
                    value={score}
                    unit="%"
                    accent={score >= 78 ? 'engage' : score >= 55 ? 'gold' : 'fight'}
                  />
                  <Stat label="Session Avg" value={avgScore} unit="%" />
                </>
              ) : (
                <div className="col-span-2 bg-canvas px-3 py-2.5">
                  <div className="font-mono text-micro uppercase text-fight">Silent probe</div>
                  <div className="display mt-1.5 text-h3 text-phosphor">NO SCORE</div>
                  <p className="mt-1 font-mono text-read text-dim">
                    Scoring is running. You just don&rsquo;t get to see it.
                  </p>
                </div>
              )}
              <Stat label="Engine" value={`${tracker.fps}`} unit="FPS" accent="neutral" />
            </div>

            <div>
              <div className="mb-1 flex justify-between font-mono text-micro tracking-[0.15em] text-dim">
                <span>PROGRESS</span>
                <span>{Math.round(((drill.durationSec - remaining) / drill.durationSec) * 100)}%</span>
              </div>
              <Meter
                pct={((drill.durationSec - remaining) / drill.durationSec) * 100}
                accent="gold"
                segments={24}
              />
            </div>

            <Panel>
              <PanelHeader label="LIVE MUSCLE MAP" accent={strainRegions.length ? 'fight' : 'engage'} />
              <div className="p-2">
                <AnatomyMap
                  target={drill.targets}
                  active={activeRegions}
                  strain={strainRegions}
                />
              </div>
            </Panel>

            <Button variant="fight" block onClick={finish}>
              <Square size={13} />
              END DRILL EARLY
            </Button>
          </motion.div>
        )}

        {/* ════════════ POST-CHECK ════════════ */}
        {phase === 'postcheck' && (
          <motion.div key="postcheck" {...fade} className="space-y-3">
            <Panel brackets>
              <PanelHeader label="FATIGUE vs FAILURE" accent="fight" />
              <div className="space-y-3 p-3">
                <p className="font-mono text-read text-phosphor">
                  Tap wherever you feel it right now. Burn in the muscle the drill was built
                  for is fatigue. Anything else — especially a joint — is failure, and we fix
                  it before you go again.
                </p>

                <AnatomyMap
                  target={drill.targets}
                  strain={flaggedStrain}
                  selected={tapped}
                  onSelect={onTapRegion}
                />
                <AnatomyLegend />

                {flaggedStrain.length > 0 ? (
                  <div className="border border-fight bg-fight/10 p-2.5">
                    <div className="flex items-center gap-1.5 font-mono text-micro tracking-[0.15em] text-fight">
                      <Activity size={12} />
                      ENGINE FLAGGED DURING THE SET
                    </div>
                    <p className="mt-1 font-mono text-read text-phosphor">
                      {flaggedStrain.map((r) => REGION_LABEL[r]).join(', ')} — the form engine
                      saw this break down while you were working, not just afterwards.
                    </p>
                  </div>
                ) : null}
              </div>
            </Panel>

            {verdictRegion && verdict ? (
                <motion.div
                  key={verdictRegion}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING}
                >
                  <Panel>
                    <PanelHeader
                      label={`${REGION_LABEL[verdictRegion]} — ${verdict.toUpperCase()}`}
                      accent={verdict === 'fatigue' ? 'engage' : 'fight'}
                    />
                    <div className="space-y-3 p-3">
                      <p className="font-mono text-read text-phosphor">
                        {verdictCopy(verdict, verdictRegion, drill)}
                      </p>
                      {verdict === 'failure' ? (
                        <Button
                          variant="fight"
                          block
                          onClick={() => queueCorrective(verdictRegion)}
                        >
                          <Timer size={14} />
                          RUN THE 2-MIN CORRECTIVE
                        </Button>
                      ) : null}
                    </div>
                  </Panel>
                </motion.div>
              ) : null}

            <div className="grid grid-cols-3 gap-px bg-edge">
              <Stat label="Reps" value={reps} />
              <Stat label="Form" value={avgScore} unit="%" />
              <Stat label="XP" value={`+${xpPreview}`} accent="engage" />
            </div>

            <Button variant="ghost" block onClick={() => save(null)} disabled={saving}>
              {saving ? 'SAVING…' : 'NOTHING HURTS — LOG IT'}
            </Button>
          </motion.div>
        )}

        {/* ════════════ CORRECTIVE ════════════ */}
        {phase === 'corrective' && corrective && verdictRegion && (
          <motion.div key="corrective" {...fade} className="space-y-3">
            <Panel brackets>
              <PanelHeader label="CORRECTIVE QUEUED" accent="fight" right={formatDuration(correctiveLeft)} />
              <div className="space-y-3 p-3">
                <h3 className="text-h2 text-phosphor">{corrective.title}</h3>
                <Meter
                  pct={((corrective.durationSec - correctiveLeft) / corrective.durationSec) * 100}
                  accent="fight"
                  segments={24}
                />
                <ol className="space-y-2">
                  {corrective.steps.map((step, i) => (
                    <li key={step} className="flex gap-2.5">
                      <span className="shrink-0 border border-fight px-1.5 font-mono text-meta font-bold text-fight">
                        {i + 1}
                      </span>
                      <span className="font-mono text-data leading-relaxed text-phosphor">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="font-mono text-read text-dim">
                  This is mobility, not punishment. If the {REGION_LABEL[verdictRegion].toLowerCase()}{' '}
                  still complains after this, stop training it and see a physio — an app cannot
                  diagnose you.
                </p>
              </div>
            </Panel>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setPhase('postcheck')}>
                BACK
              </Button>
              <Button
                variant="engage"
                onClick={() => save(`${corrective.title} — ${REGION_LABEL[verdictRegion]}`)}
                disabled={saving}
              >
                <Check size={14} />
                {saving ? 'SAVING…' : 'DONE — LOG IT'}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ════════════ DONE ════════════ */}
        {phase === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING}
            className="space-y-3"
          >
            <div className="border border-engage bg-surface p-6 text-center">
              <div className="text-h1 text-engage">+{xpPreview} XP</div>
              <p className="mt-1 text-h3 text-phosphor">{drill.name}</p>
              <p className="mt-2 font-mono text-read text-dim">
                {saveNote}
              </p>
            </div>

            {/* The ladder move is the real result of the session — more so than
                the XP, which is just volume. */}
            {ladder ? (
              <Panel brackets>
                <PanelHeader
                  label="Coaching ladder"
                  accent={
                    ladder.event === 'probe_passed' || ladder.event === 'promoted'
                      ? 'engage'
                      : ladder.event === 'demoted' ||
                          ladder.event === 'probe_failed' ||
                          ladder.event === 'mastery_lost'
                        ? 'fight'
                        : 'neutral'
                  }
                  right={`${STAGE_META[ladder.from].label} → ${STAGE_META[ladder.to].label}`}
                />
                <div className="p-3">
                  <div className="flex items-center gap-1.5">
                    {(['ACQUIRE', 'BANDWIDTH', 'SUMMARY', 'SILENT_PROBE', 'MASTERED'] as LadderStage[]).map(
                      (s, i) => {
                        const reached =
                          i <= ['ACQUIRE', 'BANDWIDTH', 'SUMMARY', 'SILENT_PROBE', 'MASTERED'].indexOf(
                            ladder.to,
                          );
                        return (
                          <span
                            key={s}
                            className={cn(
                              'h-2 flex-1 border',
                              reached ? 'border-gold bg-gold/40' : 'border-edge',
                            )}
                          />
                        );
                      },
                    )}
                  </div>
                  <p className="mt-3 font-mono text-read text-phosphor">
                    {ladder.message}
                  </p>
                  <p className="mt-2 font-mono text-read text-dim">
                    Next session: {STAGE_META[ladder.to].cuePolicy}
                  </p>
                </div>
              </Panel>
            ) : null}

            <div className="grid grid-cols-3 gap-px bg-edge">
              <Stat label="Reps" value={reps} />
              <Stat label="Time" value={formatDuration(elapsed)} accent="neutral" />
              <Stat label="Form" value={avgScore} unit="%" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={resetAll}>
                ANOTHER DRILL
              </Button>
              <Button onClick={() => (window.location.href = '/hud')}>BACK TO HUD</Button>
            </div>
          </motion.div>
        )}
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: SPRING,
};

const STAGE_TONE: Record<LadderStage, string> = {
  ACQUIRE: 'border-edgeBright text-dim',
  BANDWIDTH: 'border-gold/50 text-gold',
  SUMMARY: 'border-gold text-gold',
  SILENT_PROBE: 'border-fight text-fight',
  MASTERED: 'border-engage text-engage',
};

function StageBadge({ stage }: { stage: LadderStage }) {
  return (
    <span
      className={cn(
        'inline-block border px-1.5 py-0.5 font-mono text-micro uppercase',
        STAGE_TONE[stage],
      )}
    >
      {STAGE_META[stage].label}
    </span>
  );
}
