'use client';

import { useState } from 'react';
import { ChevronLeft, ClipboardList, PlusSquare } from 'lucide-react';
import { PlanClient } from './plan-client';
import { LogClient, type LogPrefill } from './log-client';
import { CTA } from '@/components/ui/cta';

type Mode = 'choose' | 'plan' | 'log';

/**
 * One tab for training.
 *
 * PLAN and LOG used to be separate tabs, which read as two names for the same
 * thing — and the overlap was real, not just cosmetic: the plan screen ended
 * by writing its own session with a hardcoded 60 minutes at RPE 7, doing the
 * logger's job and doing it wrong.
 *
 * They are one flow, not two features. Planning decides WHAT to train; logging
 * records how it actually went. The plan now hands off to the logger with the
 * type and name filled in, and the member supplies the two things only they
 * know — how long, and how hard.
 */
export function TrainClient({
  conditions = [],
  todaysClasses = [],
}: {
  conditions?: string[];
  todaysClasses?: Array<{ className: string; coachName: string; at: string }>;
}) {
  const [mode, setMode] = useState<Mode>('choose');
  const [prefill, setPrefill] = useState<LogPrefill | null>(null);

  if (mode === 'plan') {
    return (
      <PlanClient
        conditions={conditions}
        todaysClasses={todaysClasses}
        onComplete={(sessionType, label) => {
          setPrefill({ sessionType, label });
          setMode('log');
        }}
      />
    );
  }

  if (mode === 'log') {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setPrefill(null);
            setMode('choose');
          }}
          className="inline-flex min-h-11 items-center gap-1 font-mono text-micro uppercase text-dim hover:text-gold"
        >
          <ChevronLeft size={13} />
          Back
        </button>

        {prefill ? (
          <section className="border border-edge bg-surface px-3 py-2.5">
            <div className="font-mono text-micro uppercase tracking-[0.18em] text-gold">
              Recording your {prefill.label}
            </div>
            <p className="mt-1 font-sans text-read text-dim">
              How long, and how hard? Those two are the only things the app cannot
              work out for itself.
            </p>
          </section>
        ) : null}

        <LogClient prefill={prefill} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="border border-edge bg-surface px-3 py-3">
        <h2 className="display text-h2 text-phosphor">Training</h2>
        <p className="mt-1 font-sans text-read text-dim">
          Planning it, or recording it?
        </p>
      </section>

      <CTA onClick={() => setMode('plan')} pulse>
        <ClipboardList size={16} />
        Plan today&rsquo;s session
      </CTA>
      <p className="px-1 font-sans text-read text-dim">
        Pick a focus, warm up properly, get the exercises.
      </p>

      <CTA onClick={() => setMode('log')} tone="ghost">
        <PlusSquare size={16} />
        Log something I did
      </CTA>
      <p className="px-1 font-sans text-read text-dim">
        Already trained? Three taps and it counts.
      </p>
    </div>
  );
}
