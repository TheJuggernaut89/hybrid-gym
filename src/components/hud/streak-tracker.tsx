'use client';

import { useState, useTransition } from 'react';
import { Shield } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Readout } from '@/components/ui/industrial';
import { logRestDay } from '@/app/actions/fighter';
import { cn } from '@/lib/utils';

/**
 * @deprecated Superseded by TEMPO on /now. A streak that can reach zero turns
 * one missed session into an identity verdict, which is the single largest
 * churn detonator in a fitness app. Kept only so nothing breaks mid-migration;
 * it is no longer rendered anywhere.
 */
export function StreakTracker({
  streak,
  shields,
  lastActiveDate,
}: {
  streak: number;
  shields: number;
  lastActiveDate: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const loggedToday = lastActiveDate === today;
  const slots = Array.from({ length: 14 }, (_, i) => i < Math.min(streak, 14));

  function onRest() {
    startTransition(async () => {
      const result = await logRestDay();
      setNote(result.message);
    });
  }

  return (
    <Panel>
      <PanelHeader
        label="Streak"
        accent={streak > 0 ? 'gold' : 'neutral'}
        right={loggedToday ? 'Logged today' : 'Awaiting input'}
      />

      <div className="flex items-end justify-between gap-4 px-3 pb-3 pt-3">
        <Readout
          label="Consecutive days"
          value={streak}
          tone={streak > 0 ? 'gold' : 'phosphor'}
          size="h1"
        />
        <div className="pb-1 text-right">
          <div className="font-mono text-micro uppercase text-faint">Rest shields</div>
          <div className="mt-1.5 flex items-center justify-end gap-1">
            {Array.from({ length: 3 }, (_, i) => (
              <Shield
                key={i}
                size={16}
                className={i < shields ? 'text-engage' : 'text-edgeBright'}
                fill={i < shields ? 'currentColor' : 'none'}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 14-day chain, read as a punch-card rather than a progress bar */}
      <div className="flex gap-[2px] px-3" aria-hidden>
        {slots.map((filled, i) => (
          <span
            key={i}
            className={cn('h-7 flex-1 border', filled ? 'border-gold bg-gold/25' : 'border-edge')}
          />
        ))}
      </div>

      <p className="px-3 pb-3 pt-2 font-sans text-read text-dim">
        A missed day is absorbed by a shield. One shield regenerates every 7 consecutive
        active days.
      </p>

      <div className="border-t border-edge p-3">
        <Button variant="ghost" block onClick={onRest} disabled={pending || loggedToday}>
          {loggedToday ? 'Day already logged' : pending ? 'Logging…' : 'Log a recovery day'}
        </Button>
        {note ? (
          <p className="mt-2 border-l-2 border-engage pl-2 font-sans text-read text-engage">
            {note}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
