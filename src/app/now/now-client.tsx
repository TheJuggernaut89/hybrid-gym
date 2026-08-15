'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Shield, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { SegmentMeter, HazardBar, UnitTag } from '@/components/ui/industrial';
import {
  DECLINE_REASONS,
  DOWNGRADES,
  DAY_LABEL,
  slotPhase,
  tacticalLine,
  type DeclineReason,
  type Downgrade,
  type SlotDeclaration,
} from '@/lib/slots';
import { bandFloor, type ShieldState, type Tempo, type ProtectedWindow } from '@/lib/tempo';
import { declareSlot, resolveSlot, spendShield } from '@/app/actions/slots';
import { pushSupport, subscribeToPush, isIos, isStandalone } from '@/lib/push';
import { cn } from '@/lib/utils';

/** Inlined at build time; empty when reminders are not configured. */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

interface Option {
  gymSlotId: string;
  className: string;
  coachName: string;
  durationMin: number;
  atISO: string;
}

const SPRING = { type: 'spring' as const, stiffness: 460, damping: 32 };

export function NowClient({
  tempo,
  shields,
  protection,
  upcoming,
  lapsed,
  options,
}: {
  tempo: Tempo;
  shields: ShieldState;
  protection: ProtectedWindow | null;
  upcoming: SlotDeclaration | null;
  lapsed: SlotDeclaration[];
  options: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [showPicker, setShowPicker] = useState(!upcoming);
  const [showShield, setShowShield] = useState(false);
  const [askReminders, setAskReminders] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);

  const phase = upcoming ? slotPhase(upcoming) : null;
  const toResolve = lapsed[0] ?? null;

  function run(
    fn: () => Promise<{ ok: boolean; message: string }>,
    opts?: { offerReminders?: boolean },
  ) {
    startTransition(async () => {
      const r = await fn();
      setNote(r.message);
      // Only ever offered right after a member commits to being somewhere —
      // see the note in lib/push.ts on why the timing of this ask matters more
      // than the ask itself.
      if (r.ok && opts?.offerReminders && VAPID && pushSupport() === 'default') {
        setAskReminders(true);
      }
    });
  }

  async function enableReminders() {
    setReminderBusy(true);
    const r = await subscribeToPush(VAPID);
    setReminderBusy(false);
    setNote(r.message);
    setAskReminders(false);
  }

  const TrendIcon =
    tempo.trend === 'climbing' ? TrendingUp : tempo.trend === 'slipping' ? TrendingDown : Minus;

  return (
    <div>
      {protection ? (
        <>
          <HazardBar tone="gold" />
          <div className="border-b border-edge px-3 py-2.5">
            <div className="font-mono text-micro uppercase text-gold">
              {protection.label} — protected window
            </div>
            <p className="mt-1 font-mono text-read text-dim">
              Tempo is re-based for this period. Missing sessions here is the calendar, not a
              lapse.
            </p>
          </div>
        </>
      ) : null}


      {/* ── unresolved: the decline-reason capture ──────────────────────── */}
      {toResolve ? (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          className="border-b border-edge"
        >
          <HazardBar />
          <div className="px-3 py-3">
            <div className="font-mono text-micro uppercase text-fight">Unresolved slot</div>
            <h2 className="display mt-1 text-h2 text-phosphor">
              {toResolve.className} —{' '}
              {new Date(toResolve.scheduledFor).toLocaleString('en-GB', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </h2>
            <p className="mt-1 font-mono text-read text-dim">
              Did it happen? One tap either way — no lecture attached to the answer.
            </p>

            <Button
              variant="engage"
              block
              className="mt-3"
              disabled={pending}
              onClick={() => run(() => resolveSlot(toResolve.id, { kind: 'honoured' }))}
            >
              <Check size={14} />
              I trained
            </Button>

            <div className="mt-2 font-mono text-micro uppercase text-faint">
              Or what got in the way
            </div>
            <div className="mt-1.5 grid grid-cols-5 gap-1">
              {DECLINE_REASONS.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  disabled={pending}
                  title={r.gloss}
                  onClick={() =>
                    run(() =>
                      resolveSlot(toResolve.id, {
                        kind: 'declined',
                        reason: r.code as DeclineReason,
                      }),
                    )
                  }
                  className="min-h-11 border border-edge bg-canvas px-1 py-2 font-mono text-micro uppercase text-dim hover:border-fight hover:text-fight [touch-action:manipulation]"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </motion.section>
      ) : null}

      {/* ── the live slot ───────────────────────────────────────────────── */}
      {upcoming && phase && phase !== 'resolved' ? (
        <section className="border-b border-edge px-3 py-3">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-micro uppercase text-faint">
              {phase === 'scheduled'
                ? 'Locked in'
                : phase === 'approaching'
                  ? 'T-90'
                  : phase === 'imminent'
                    ? 'T-30'
                    : 'In progress'}
            </span>
            <span className="telemetry font-mono text-micro uppercase text-gold">
              {new Date(upcoming.scheduledFor).toLocaleString('en-GB', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <h2 className="display mt-1 text-h2 text-phosphor">{upcoming.className}</h2>
          <div className="font-mono text-micro uppercase text-faint">
            {upcoming.coachName} · {upcoming.durationMin} min
          </div>

          <p className="mt-2 border-l-2 border-gold pl-2 font-mono text-read text-phosphor">
            {tacticalLine(upcoming)}
          </p>

          {phase === 'active' ? (
            <Button
              variant="engage"
              block
              className="mt-3"
              disabled={pending}
              onClick={() => run(() => resolveSlot(upcoming.id, { kind: 'honoured' }))}
            >
              <Check size={14} />
              Log it
            </Button>
          ) : null}

          {/* Graded downgrade. The choice is never binary — a binary choice is
              how a single bad evening turns into a lapsed month. */}
          {phase === 'imminent' || phase === 'approaching' ? (
            <div className="mt-3">
              <div className="font-mono text-micro uppercase text-faint">
                Cannot do the full session?
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {DOWNGRADES.map((d) => (
                  <button
                    key={d.code}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        resolveSlot(upcoming.id, {
                          kind: 'downgraded',
                          downgrade: d.code as Downgrade,
                        }),
                      )
                    }
                    className="min-h-11 border border-edgeBright bg-canvas px-2 py-2 text-left hover:border-gold [touch-action:manipulation]"
                  >
                    <span className="display block text-h3 text-phosphor">{d.label}</span>
                    <span className="block font-mono text-micro leading-tight text-faint">
                      {d.blurb}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── reminders ───────────────────────────────────────────────────────
          Offered once, immediately after committing to a slot, and never on
          page load. The browser only ever shows the permission dialog once —
          a denied permission is effectively permanent — so the ask is spent
          at the single moment a reminder is obviously for the member rather
          than for the gym. */}
      {askReminders ? (
        <section className="border-b border-edge bg-surface">
          <HazardBar tone="gold" />
          <div className="px-3 py-2.5">
            <div className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
              {'>>'} Want a nudge before it?
            </div>
            <p className="mt-1.5 font-mono text-read text-phosphor">
              90 minutes out, then 30. Enough to beat the jam, not enough to nag.
            </p>
            {isIos() && !isStandalone() ? (
              <p className="mt-1.5 font-mono text-read text-dim">
                On iPhone this needs the app on your Home Screen first — Share, then Add
                to Home Screen.
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-px bg-edge">
            <button
              type="button"
              onClick={() => setAskReminders(false)}
              className="min-h-11 bg-canvas font-mono text-micro uppercase tracking-[0.14em] text-dim [touch-action:manipulation] hover:text-phosphor"
            >
              No thanks
            </button>
            <button
              type="button"
              disabled={reminderBusy}
              onClick={() => void enableReminders()}
              className="min-h-11 bg-gold font-mono text-micro font-bold uppercase tracking-[0.14em] text-canvas [touch-action:manipulation] disabled:opacity-50"
            >
              {reminderBusy ? 'Setting up…' : 'Remind me'}
            </button>
          </div>
        </section>
      ) : null}

      {/* ── declare ─────────────────────────────────────────────────────────
          The one causal control on this screen. When there is nothing booked
          it is a filled primary button, not a chevron: a member with no slot
          declared is exactly the member this screen exists for, and the action
          should not need finding. Once something IS booked it steps back to a
          quiet secondary row — the commitment above it is the point by then. */}
      <section className="border-b border-edge">
        <button
          type="button"
          onClick={() => setShowPicker((s) => !s)}
          aria-expanded={showPicker}
          className={cn(
            'flex w-full items-center justify-between [touch-action:manipulation]',
            upcoming
              ? 'min-h-11 px-3 py-2.5'
              : 'min-h-[60px] bg-gold px-3 py-3',
          )}
        >
          <span
            className={cn(
              'font-mono uppercase',
              upcoming
                ? 'text-micro text-gold'
                : 'text-data font-bold tracking-[0.14em] text-canvas',
            )}
          >
            {upcoming ? 'Declare another slot' : 'Book your next session'}
          </span>
          <ChevronDown
            size={upcoming ? 14 : 18}
            className={cn(
              'transition-transform',
              upcoming ? 'text-dim' : 'text-canvas',
              showPicker && 'rotate-180',
            )}
          />
        </button>

        {showPicker ? (
          <ul className="rule-grid grid-cols-1 border-t border-edge">
            {options.map((o) => {
              const at = new Date(o.atISO);
              return (
                <li key={o.atISO + o.gymSlotId} className="bg-canvas">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          declareSlot({
                            gymSlotId: o.gymSlotId,
                            className: o.className,
                            coachName: o.coachName,
                            scheduledFor: o.atISO,
                            durationMin: o.durationMin,
                          }),
                        { offerReminders: true },
                      )
                    }
                    className="flex min-h-11 w-full items-baseline gap-3 px-3 py-2.5 text-left hover:bg-gold/5 [touch-action:manipulation]"
                  >
                    <span className="telemetry w-16 shrink-0 font-mono text-micro uppercase text-gold">
                      {DAY_LABEL[at.getDay()]}{' '}
                      {at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="display min-w-0 flex-1 truncate text-h3 text-phosphor">
                      {o.className}
                    </span>
                    <span className="shrink-0 font-mono text-micro uppercase text-faint">
                      {o.coachName.replace('Coach ', '')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* ── TEMPO ───────────────────────────────────────────────────────
          Demoted, deliberately. This screen exists to catch someone
          before they decide not to come, and TEMPO is a description of
          the past — nothing a member can act on. It used to be ~98px at
          the top while the declare control hid behind a chevron below
          the fold, which is the hierarchy exactly backwards. */}
      <section className="border-b border-edge px-3 pb-3 pt-4">
        <div className="flex items-baseline justify-between">
          <div className="font-mono text-micro uppercase text-faint">Tempo — 28 day</div>
          <div
            className={cn(
              'flex items-center gap-1 font-mono text-micro uppercase',
              tempo.trend === 'climbing'
                ? 'text-engage'
                : tempo.trend === 'slipping'
                  ? 'text-fight'
                  : 'text-dim',
            )}
          >
            <TrendIcon size={11} />
            {tempo.delta > 0 ? '+' : ''}
            {tempo.delta.toFixed(1)} vs prev
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="display text-h2 leading-[0.85] text-gold">
            {tempo.current.toFixed(1)}
          </div>
          <div className="pb-1 font-mono text-micro uppercase text-dim">
            sessions
            <br />
            per week
          </div>
        </div>

        <div className="mt-1 flex items-baseline justify-between">
          <span className="display text-h3 text-phosphor">{tempo.band}</span>
          <span className="telemetry font-mono text-micro uppercase text-faint">
            {tempo.sessions} in 28d
            {tempo.daysSinceLast !== null ? ` · last ${tempo.daysSinceLast}d ago` : ''}
          </span>
        </div>

        <SegmentMeter
          pct={Math.min(100, (tempo.current / 5) * 100)}
          segments={25}
          tone={tempo.trend === 'slipping' ? 'fight' : 'gold'}
          className="mt-2"
        />

        <p className="mt-2 font-mono text-read text-dim">
          {tempo.toHold > 0
            ? `${tempo.toHold} more session${tempo.toHold > 1 ? 's' : ''} to hold ${tempo.band}. This number moves slowly — one miss is not a reset.`
            : `Holding ${tempo.band}. Floor is ${bandFloor(tempo.band).toFixed(2)}/wk.`}
        </p>
      </section>

      {/* ── shield bank ─────────────────────────────────────────────────── */}
      <div className="p-3">
        <Panel>
          <PanelHeader
            label="Shield bank"
            accent={shields.available > 0 ? 'engage' : 'neutral'}
            right={shields.atCap ? 'At cap' : `${shields.toNext} sessions to next`}
          />
          <div className="flex items-center justify-between px-3 py-3">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 3 }, (_, i) => (
                <Shield
                  key={i}
                  size={22}
                  className={i < shields.available ? 'text-engage' : 'text-edgeBright'}
                  fill={i < shields.available ? 'currentColor' : 'none'}
                />
              ))}
            </div>
            <UnitTag label="Minted" value={String(shields.minted)} />
          </div>

          <p className="px-3 pb-3 font-mono text-read text-dim">
            Every 5 sessions mints a shield. Spending one protects a week you already know you
            will miss — you choose when, and you say why. Shields you did not earn would not
            mean anything.
          </p>

          {shields.available > 0 ? (
            <div className="border-t border-edge p-3">
              {showShield ? (
                <div className="grid grid-cols-5 gap-1">
                  {DECLINE_REASONS.map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          spendShield(r.label, new Date().toISOString().slice(0, 10)),
                        )
                      }
                      className="min-h-11 border border-edge bg-canvas px-1 py-2 font-mono text-micro uppercase text-dim hover:border-engage hover:text-engage [touch-action:manipulation]"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Button variant="ghost" block onClick={() => setShowShield(true)}>
                  Spend a shield
                </Button>
              )}
            </div>
          ) : null}
        </Panel>

        {note ? (
          <p className="mt-3 border-l-2 border-gold pl-2 font-mono text-read text-phosphor">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
