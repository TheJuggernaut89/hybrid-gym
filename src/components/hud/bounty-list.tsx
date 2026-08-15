import { Panel, PanelHeader } from '@/components/ui/panel';
import { SegmentMeter } from '@/components/ui/industrial';
import { cn } from '@/lib/utils';
import type { BountyProgress } from '@/lib/types';

const UNIT: Record<string, string> = {
  calories: 'KCAL',
  active_minutes: 'MIN',
  sessions: 'SESSIONS',
  home_sessions: 'DRILLS',
  accuracy_avg: '% FORM',
  streak: 'DAYS',
};

export function BountyList({ bounties }: { bounties: BountyProgress[] }) {
  const active = bounties.slice(0, 6);
  const cleared = active.filter((b) => b.complete).length;

  return (
    <Panel>
      <PanelHeader
        label="Active bounties"
        right={`${String(cleared).padStart(2, '0')}/${String(active.length).padStart(2, '0')} cleared`}
      />
      {active.length === 0 ? (
        <p className="p-3 font-mono text-read text-dim">
          No bounties posted. Seed the <span className="text-gold">bounties</span> table.
        </p>
      ) : (
        <ul className="divide-y divide-edge">
          {active.map((b, i) => (
            <li key={b.id} className="px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-micro text-faint" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3
                  className={cn(
                    'display min-w-0 flex-1 truncate text-h3',
                    b.complete ? 'text-engage' : 'text-phosphor',
                  )}
                >
                  {b.title}
                </h3>
                <span
                  className={cn(
                    'shrink-0 font-mono text-micro',
                    b.complete ? 'text-engage' : 'text-gold',
                  )}
                >
                  +{b.xp_reward}
                </span>
              </div>

              <p className="mt-1 pl-6 font-mono text-read text-dim">
                {b.description}
              </p>

              <div className="mt-2 flex items-center gap-2 pl-6">
                <SegmentMeter
                  pct={b.pct}
                  segments={14}
                  tone={b.complete ? 'engage' : 'gold'}
                  className="flex-1"
                />
                <span className="telemetry shrink-0 font-mono text-micro text-dim">
                  {b.current}
                  <span className="text-faint">/{b.target_value}</span>{' '}
                  <span className="text-faint">{UNIT[b.target_metric] ?? ''}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
