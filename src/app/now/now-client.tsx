'use client';

import { useEffect, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Shield, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { SegmentMeter, HazardBar, UnitTag } from '@/components/ui/industrial';
import {
  DECLINE_REASONS,
  SHIELD_REASONS,
  DOWNGRADES,
  gymDayTime,
  gymTime,
  gymDay,
  gymInstant,
  nodLine,
  seatLine,
  FLOOR_KINDS,
  FLOOR_HOURS,
  slotPhase,
  tacticalLine,
  type DeclineReason,
  type Downgrade,
  type SlotDeclaration,
} from '@/lib/slots';
import { bandFloor, type ShieldState, type Tempo, type ProtectedWindow } from '@/lib/tempo';
import { declareSlot, resolveSlot, spendShield } from '@/app/actions/slots';
import { setGymVisibility } from '@/app/actions/fighter';
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
  /** Opted-in nicknames already declared against this session. */
  mates: string[];
  /** Null when the class has no capacity set — which is the default. */
  taken: number | null;
  capacity: number | null;
}

const SPRING = { type: 'spring' as const, stiffness: 460, damping: 32 };

export function NowClient({
  tempo,
  shields,
  protection,
  upcoming,
  lapsed,
  options,
  askVisibility = false,
}: {
  tempo: Tempo;
  shields: ShieldState;
  protection: ProtectedWindow | null;
  upcoming: SlotDeclaration | null;
  lapsed: SlotDeclaration[];
  options: Option[];
  /** Member has no nickname yet — offer the opt-in once. */
  askVisibility?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [showPicker, setShowPicker] = useState(!upcoming);
  const [showShield, setShowShield] = useState(false);
  /** Days from today for the week a shield will cover. 0 = this week. */
  const [shieldWeek, setShieldWeek] = useState(0);
  const [nickname, setNickname] = useState('');
  const [visibilityDone, setVisibilityDone] = useState(false);
  const [pickerTab, setPickerTab] = useState<'class' | 'floor'>('class');
  const [floorKind, setFloorKind] = useState<'floor' | 'cardio'>('floor');
  const [floorDay, setFloorDay] = useState(0);
  const [askReminders, setAskReminders] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);

  /**
   * A ticking clock, because the slot phase is not a label — the "Log it"
   * button and the downgrade offers are gated on it.
   *
   * `force-dynamic` on the page re-runs the server component for a NAVIGATION.
   * It does nothing for an installed PWA resumed from the background, which is
   * exactly how this screen is used: open it before class, put the phone in a
   * bag, come back afterwards. Computed once at render, `phase` was still
   * `approaching` an hour later — the member was offered a downgrade for a
   * class they had just finished, and had no way to log it.
   *
   * The visibility listener matters as much as the interval: a backgrounded tab
   * has its timers throttled hard, so the first thing to do on resume is
   * recompute rather than wait out the remainder of a stale tick.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 30_000);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const phase = upcoming ? slotPhase(upcoming, now) : null;
  // `lapsed` is computed on the server too, so a slot that runs out while this
  // page is open would never appear in it. Catch that transition here.
  const toResolve = lapsed[0] ?? (phase === 'lapsed' ? upcoming : null);

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
            {/* This used to assert "Tempo is re-based for this period" while
                computeTempo took no protection argument at all and counted
                Raya exactly like any other week. It is true now, and it says
                how much rather than asking to be believed. */}
            <p className="mt-1 font-sans text-read text-dim">
              {tempo.protectedDays > 0
                ? `${tempo.protectedDays} ${tempo.protectedDays === 1 ? 'day' : 'days'} discounted from your tempo window. Missing sessions here is the calendar, not a lapse.`
                : 'Missing sessions here is the calendar, not a lapse.'}
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
              {toResolve.className} — {gymDayTime(toResolve.scheduledFor)}
            </h2>
            <p className="mt-1 font-sans text-read text-dim">
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
            <div className="mt-1.5 grid grid-cols-3 gap-1">
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
              {gymDayTime(upcoming.scheduledFor)}
            </span>
          </div>

          <h2 className="display mt-1 text-h2 text-phosphor">{upcoming.className}</h2>
          <div className="font-mono text-micro uppercase text-faint">
            {upcoming.coachName ? `${upcoming.coachName} · ` : ''}
            {upcoming.durationMin} min
          </div>

          <p className="mt-2 border-l-2 border-gold pl-2 font-sans text-read text-phosphor">
            {tacticalLine(upcoming, now)}
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
            <p className="mt-1.5 font-sans text-read text-phosphor">
              90 minutes out, then 30. Enough to beat the jam, not enough to nag.
            </p>
            {isIos() && !isStandalone() ? (
              <p className="mt-1.5 font-sans text-read text-dim">
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
          <div className="border-t border-edge">
            {/* Classes or the floor.
                /now used to offer eight martial-arts rows and nothing else, so
                a member who lifts and never takes a class had no control on
                the landing screen at all — and push permission is only ever
                offered on the declare path, so the app could not reach them. */}
            <div className="rule-grid grid-cols-2">
              {(
                [
                  { key: 'class', label: 'Classes' },
                  { key: 'floor', label: 'Floor & cardio' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setPickerTab(t.key)}
                  className={cn(
                    'min-h-11 px-3 py-2 font-mono text-micro font-bold uppercase tracking-[0.14em] [touch-action:manipulation]',
                    pickerTab === t.key
                      ? 'bg-gold text-canvas'
                      : 'bg-canvas text-dim hover:text-gold',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {pickerTab === 'floor' ? (
              <div className="space-y-3 px-3 py-3">
                <div>
                  <div className="font-mono text-micro uppercase text-faint">What</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1">
                    {FLOOR_KINDS.map((k) => (
                      <button
                        key={k.kind}
                        type="button"
                        onClick={() => setFloorKind(k.kind)}
                        className={cn(
                          'min-h-11 border px-2 py-2 text-left [touch-action:manipulation]',
                          floorKind === k.kind
                            ? 'border-gold bg-gold/10'
                            : 'border-edge bg-canvas hover:border-gold',
                        )}
                      >
                        <div
                          className={cn(
                            'font-mono text-micro uppercase',
                            floorKind === k.kind ? 'text-gold' : 'text-dim',
                          )}
                        >
                          {k.label}
                        </div>
                        <div className="font-sans text-micro text-faint">{k.blurb}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-mono text-micro uppercase text-faint">When</div>
                  <div className="mt-1.5 grid grid-cols-4 gap-1">
                    {Array.from({ length: 7 }, (_, i) => i).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setFloorDay(d)}
                        className={cn(
                          'min-h-11 border px-1 py-2 font-mono text-micro uppercase [touch-action:manipulation]',
                          floorDay === d
                            ? 'border-gold bg-gold/10 text-gold'
                            : 'border-edge bg-canvas text-dim hover:border-gold',
                        )}
                      >
                        {d === 0 ? 'Today' : d === 1 ? 'Tmrw' : gymDay(gymInstant(d, '12:00', now))}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-mono text-micro uppercase text-faint">
                    What time — one tap locks it in
                  </div>
                  <div className="mt-1.5 grid grid-cols-4 gap-1">
                    {FLOOR_HOURS.map((hh) => {
                      const at = gymInstant(floorDay, hh, now);
                      const past = at.getTime() <= now.getTime();
                      const spec = FLOOR_KINDS.find((k) => k.kind === floorKind)!;
                      return (
                        <button
                          key={hh}
                          type="button"
                          disabled={pending || past}
                          onClick={() =>
                            run(
                              () =>
                                declareSlot({
                                  gymSlotId: null,
                                  kind: spec.kind,
                                  className: spec.label,
                                  coachName: null,
                                  scheduledFor: at.toISOString(),
                                  durationMin: spec.durationMin,
                                }),
                              { offerReminders: true },
                            )
                          }
                          className={cn(
                            'min-h-11 border px-1 py-2 font-mono text-micro uppercase [touch-action:manipulation]',
                            past
                              ? 'border-edge bg-canvas text-edgeBright'
                              : 'border-edge bg-canvas text-dim hover:border-gold hover:text-gold',
                          )}
                        >
                          {hh}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
          <ul className="rule-grid grid-cols-1">
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
                      {gymDay(at)} {gymTime(at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="display block truncate text-h3 text-phosphor">
                        {o.className}
                      </span>
                      {nodLine(o.mates) ? (
                        <span className="block truncate font-mono text-micro uppercase text-engage">
                          {nodLine(o.mates)}
                        </span>
                      ) : null}
                    </span>
                    {seatLine(o.taken, o.capacity) ? (
                      <span
                        className={cn(
                          'shrink-0 font-mono text-micro uppercase',
                          seatLine(o.taken, o.capacity) === 'Full' ? 'text-fight' : 'text-gold',
                        )}
                      >
                        {seatLine(o.taken, o.capacity)}
                      </span>
                    ) : null}
                    <span className="shrink-0 font-mono text-micro uppercase text-faint">
                      {o.coachName.replace('Coach ', '')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
            )}
          </div>
        ) : null}
      </section>

      {/* ── THE NOD opt-in ──────────────────────────────────────────────
          Shown once, to members who have no nickname yet. It has to live here
          rather than in induction: /now only redirects to onboarding when
          !fighter.onboarded, so everyone already using the app would never be
          asked. Default is off and stays off unless this is answered. */}
      {askVisibility && !visibilityDone ? (
        <section className="border-b border-edge px-3 py-3">
          <div className="font-mono text-micro uppercase text-engage">Training partners</div>
          <p className="mt-1 font-sans text-read text-dim">
            Want classmates to see you have booked the same session? Pick a name they would
            recognise. You are hidden until you say otherwise, and you can turn it off later.
          </p>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={24}
            placeholder="Aina"
            aria-label="Nickname shown to classmates"
            className="mt-2 min-h-11 w-full border border-edge bg-canvas px-2 font-mono text-data uppercase text-phosphor placeholder:text-edgeBright focus:border-gold focus:outline-none"
          />
          <div className="mt-2 grid grid-cols-2 gap-1">
            <Button
              variant="engage"
              disabled={pending || !nickname.trim()}
              onClick={() =>
                run(async () => {
                  const r = await setGymVisibility(nickname, true);
                  if (r.ok) setVisibilityDone(true);
                  return r;
                })
              }
            >
              Show my name
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await setGymVisibility('', false);
                  if (r.ok) setVisibilityDone(true);
                  return r;
                })
              }
            >
              Stay hidden
            </Button>
          </div>
        </section>
      ) : null}

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

        <p className="mt-2 font-sans text-read text-dim">
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

          <p className="px-3 pb-3 font-sans text-read text-dim">
            Every 5 sessions mints a shield. Spend one on a week you already know you will
            miss and those seven days stop counting against your tempo — it holds where it is
            instead of sagging. It will not push your tempo higher than you earned. Shields
            you did not earn would not mean anything.
          </p>

          {shields.available > 0 ? (
            <div className="border-t border-edge p-3">
              {showShield ? (
                <>
                  {/* "You choose when" was not true: the old call always sent
                      today, and spend_shield rejected any future date — so a
                      week you could see coming could not be protected until
                      after it had cost you. */}
                  <div className="font-mono text-micro uppercase text-faint">
                    Which week
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1">
                    {(
                      [
                        { key: 'this', label: 'This week', offset: 0 },
                        { key: 'next', label: 'Next week', offset: 7 },
                      ] as const
                    ).map((w) => (
                      <button
                        key={w.key}
                        type="button"
                        onClick={() => setShieldWeek(w.offset)}
                        className={cn(
                          'min-h-11 border px-2 py-2 font-mono text-micro uppercase [touch-action:manipulation]',
                          shieldWeek === w.offset
                            ? 'border-engage bg-engage/10 text-engage'
                            : 'border-edge bg-canvas text-dim hover:border-engage hover:text-engage',
                        )}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 font-mono text-micro uppercase text-faint">
                    And why
                  </div>
                  <div className="mt-1.5 grid grid-cols-5 gap-1">
                    {/* SHIELD_REASONS, not DECLINE_REASONS — a shield is spent
                        on a week the member will miss, so a gym-side reason
                        like "class was full" has no meaning here. */}
                    {SHIELD_REASONS.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        disabled={pending}
                        title={r.gloss}
                        onClick={() =>
                          run(() =>
                            spendShield(
                              r.label,
                              new Date(Date.now() + shieldWeek * 86_400_000)
                                .toISOString()
                                .slice(0, 10),
                            ),
                          )
                        }
                        className="min-h-11 border border-edge bg-canvas px-1 py-2 font-mono text-micro uppercase text-dim hover:border-engage hover:text-engage [touch-action:manipulation]"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <Button variant="ghost" block onClick={() => setShowShield(true)}>
                  Spend a shield
                </Button>
              )}
            </div>
          ) : null}
        </Panel>

        {note ? (
          <p className="mt-3 border-l-2 border-gold pl-2 font-sans text-read text-phosphor">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
