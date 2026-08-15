'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, ChevronLeft, Dumbbell, Users } from 'lucide-react';
import gsap from 'gsap';
import { FOCUS_DAYS, buildDay, type FocusDay } from '@/lib/workouts';
import { logSession } from '@/app/actions/session';
import { CTA } from '@/components/ui/cta';
import { HazardBar } from '@/components/ui/industrial';
import { ScreenNotice } from '@/components/health/screen-notice';
import { screen } from '@/lib/contraindications';
import { cn } from '@/lib/utils';

/**
 * Today's plan.
 *
 * Daily, not weekly, and deliberately so: a weekly programme is a commitment
 * most members quietly fail in week two, and a plan you have already fallen
 * behind is a reason not to come in. This asks one question — what are you
 * training today — and answers it completely.
 *
 * PREP COMES FIRST AND IS NOT SKIPPABLE-BY-DEFAULT. It is the first screen
 * after picking a focus, because the warm-up is the part everyone drops and
 * the part that decides whether the session hurts tomorrow.
 */
export function PlanClient({
  conditions = [],
  todaysClasses = [],
}: {
  conditions?: string[];
  todaysClasses?: Array<{ className: string; coachName: string; at: string }>;
}) {
  const [focus, setFocus] = useState<FocusDay | null>(null);
  const [stage, setStage] = useState<'prep' | 'work'>('prep');
  const [donePrep, setDonePrep] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [logged, setLogged] = useState('');

  const plan = useMemo(() => (focus ? buildDay(focus) : null), [focus]);

  const flags = screen({
    conditions,
    subjects: plan
      ? [
          plan.focus.label,
          ...plan.main.map((m) => m.exercise.name),
          ...plan.main.map((m) => m.exercise.pattern),
        ]
      : [],
  });

  function pick(f: FocusDay) {
    setFocus(f);
    setStage('prep');
    setDonePrep(new Set());
    setLogged('');
  }

  function togglePrep(name: string) {
    setDonePrep((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function finish() {
    if (!plan) return;
    startTransition(async () => {
      const r = await logSession({
        sessionType: plan.focus.groups.includes('combat')
          ? 'combat'
          : plan.focus.groups.includes('conditioning')
            ? 'conditioning'
            : 'lift',
        durationMin: 60,
        rpe: 7,
        label: plan.focus.label,
      });
      setLogged(r.message);
    });
  }

  /* ── pick a focus ─────────────────────────────────────────────────── */
  if (!focus || !plan) {
    return (
      <div className="space-y-3">
        <section className="border border-edge bg-surface px-3 py-3">
          <h2 className="display text-h2 text-phosphor">What are you training?</h2>
          <p className="mt-1 font-sans text-read text-dim">
            Pick today. Tomorrow is tomorrow&rsquo;s problem.
          </p>
        </section>

        <ul className="rule-grid grid-cols-2 border border-edge">
          {FOCUS_DAYS.map((f, i) => (
            <li key={f.id} className="bg-canvas">
              <button
                type="button"
                onClick={(e) => {
                  gsap.fromTo(
                    e.currentTarget,
                    { scale: 0.96 },
                    { scale: 1, duration: 0.3, ease: 'back.out(2)' },
                  );
                  pick(f);
                }}
                style={{ animationDelay: `${i * 20}ms` }}
                className="flex min-h-[64px] w-full flex-col justify-center px-2.5 py-2 text-left [touch-action:manipulation] hover:bg-gold/5"
              >
                <span className="font-mono text-data font-bold uppercase tracking-[0.1em] text-phosphor">
                  {f.label}
                </span>
                <span className="font-sans text-read leading-snug text-dim">{f.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const prepLeft = plan.prep.length - donePrep.size;

  /* ── prep ─────────────────────────────────────────────────────────── */
  if (stage === 'prep') {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setFocus(null)}
          className="inline-flex min-h-11 items-center gap-1 font-mono text-micro uppercase text-dim hover:text-gold"
        >
          <ChevronLeft size={13} />
          Change focus
        </button>

        <section className="border border-edge bg-surface">
          <HazardBar tone="gold" />
          <div className="px-3 py-3">
            <div className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
              Step 1 of 2 · {plan.focus.label}
            </div>
            <h2 className="display mt-1 text-h2 text-phosphor">Prep first</h2>
            <p className="mt-1.5 font-sans text-read text-dim">
              About {plan.prepMin} minutes. Tick them off as you go.
            </p>
          </div>
        </section>

        <ScreenNotice flags={flags} />

        <ul className="rule-grid grid-cols-1 border border-edge">
          {plan.prep.map((s) => {
            const done = donePrep.has(s.name);
            return (
              <li key={s.name} className="bg-canvas">
                <button
                  type="button"
                  onClick={() => togglePrep(s.name)}
                  className="flex min-h-[56px] w-full items-start gap-3 px-3 py-2.5 text-left [touch-action:manipulation]"
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-5 w-5 shrink-0 place-items-center border',
                      done ? 'border-engage bg-engage text-canvas' : 'border-edgeBright',
                    )}
                  >
                    {done ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block font-sans text-lede font-semibold',
                        done ? 'text-dim line-through' : 'text-phosphor',
                      )}
                    >
                      {s.name}
                    </span>
                    <span className="block font-sans text-read leading-snug text-dim">
                      {s.detail}
                    </span>
                  </span>
                  <span className="telemetry shrink-0 font-mono text-micro uppercase text-gold">
                    {s.dose}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <CTA onClick={() => setStage('work')} pulse={prepLeft === 0}>
          {prepLeft === 0 ? 'Prep done — start the work' : `Skip ahead (${prepLeft} left)`}
        </CTA>
      </div>
    );
  }

  /* ── the work ─────────────────────────────────────────────────────── */
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setStage('prep')}
        className="inline-flex min-h-11 items-center gap-1 font-mono text-micro uppercase text-dim hover:text-gold"
      >
        <ChevronLeft size={13} />
        Back to prep
      </button>

      <section className="border border-edge bg-surface px-3 py-3">
        <div className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
          Step 2 of 2 · {plan.focus.label}
        </div>
        <h2 className="display mt-1 text-h2 text-phosphor">The work</h2>
        {plan.gymOnly > 0 ? (
          <p className="mt-1.5 flex items-center gap-1.5 font-sans text-read text-dim">
            <Dumbbell size={14} className="shrink-0 text-gold" />
            {plan.gymOnly} of these need the gym floor.
          </p>
        ) : null}
      </section>

      <ol className="rule-grid grid-cols-1 border border-edge">
        {plan.main.map((m, i) => (
          <li key={m.exercise.id} className="bg-canvas px-3 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-micro text-dim" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="display min-w-0 flex-1 text-h3 leading-[1.05] text-phosphor">
                {m.exercise.name}
              </h3>
              <span className="telemetry shrink-0 font-mono text-data font-bold text-gold">
                {m.sets} × {m.reps}
              </span>
            </div>
            <p className="mt-1 pl-6 font-sans text-read leading-snug text-dim">{m.note}</p>
            <p className="mt-1 pl-6 font-mono text-micro uppercase text-dim">
              {m.exercise.equipment}
              {m.exercise.venue === 'class' ? ' · needs a class' : ''}
            </p>
          </li>
        ))}
      </ol>

      {/* The whole point of the app: put a real class in front of someone who
          has just decided what they are training today. */}
      {todaysClasses.length > 0 ? (
        <section className="border border-gold bg-surface">
          <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
            <Users size={14} className="text-gold" />
            <span className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
              On at the gym today
            </span>
          </div>
          <ul className="divide-y divide-edge">
            {todaysClasses.map((c) => (
              <li key={c.at + c.className} className="flex items-baseline gap-3 px-3 py-2.5">
                <span className="telemetry w-14 shrink-0 font-mono text-micro uppercase text-gold">
                  {c.at}
                </span>
                <span className="display min-w-0 flex-1 truncate text-h3 text-phosphor">
                  {c.className}
                </span>
                <span className="shrink-0 font-mono text-micro uppercase text-dim">
                  {c.coachName}
                </span>
              </li>
            ))}
          </ul>
          <CTA href="/now" tone="ghost" className="border-x-0 border-b-0">
            Book one
          </CTA>
        </section>
      ) : null}

      {logged ? (
        <section className="border border-engage bg-surface px-3 py-2.5">
          <p className="font-sans text-read text-phosphor">{logged}</p>
        </section>
      ) : (
        <CTA onClick={finish} disabled={pending} pulse>
          {pending ? 'Logging…' : 'Done — log this session'}
        </CTA>
      )}
    </div>
  );
}
