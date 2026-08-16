import Link from 'next/link';
import { getCoachRoster } from '@/lib/data';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { HazardBar } from '@/components/ui/industrial';

export const metadata = { title: 'ROSTER // HYBRID HUD' };
export const dynamic = 'force-dynamic';

/**
 * The coach roster.
 *
 * Read-only, and there is deliberately no message button. PRODUCT-DIRECTION.md
 * is blunt about the risk this screen carries: "The coach console is a
 * surveillance instrument pointed at members. If a coach uses it to publicly
 * shame someone in the group chat, community trust detonates in a week and no
 * amount of code repairs it."
 *
 * So the screen shows the one fact that prompts a private conversation — how
 * long since someone trained — and nothing else. No decline reasons: those were
 * collected under an explicit promise of "no lecture attached to the answer",
 * and handing them to staff would rewrite that deal after the fact.
 */
export default async function RosterPage() {
  const roster = await getCoachRoster();

  return (
    <>
      <TopBar title="Roster" subtitle="Who has gone quiet" demo={!isSupabaseConfigured} />
      <main className="mx-auto w-full max-w-md px-3 pb-28 pt-3">
        {roster === null ? (
          <Panel>
            <HazardBar />
            <div className="px-3 py-3">
              <div className="font-mono text-micro uppercase text-fight">Not a coach</div>
              <p className="mt-1 font-sans text-read text-dim">
                This screen is for gym staff. If that should be you, the owner can set it in
                Supabase — there is no in-app way to promote yourself, on purpose.
              </p>
              <Link
                href="/now"
                className="mt-3 inline-flex min-h-11 items-center font-mono text-micro uppercase text-gold"
              >
                Back to Now
              </Link>
            </div>
          </Panel>
        ) : (
          <div className="space-y-3">
            <section className="border border-edge bg-surface px-3 py-2.5">
              <p className="font-sans text-read text-dim">
                Longest absence first. This is a list for starting a conversation, not a
                scoreboard — and never something to read out in the group chat.
              </p>
            </section>

            <Panel>
              <PanelHeader
                label="Members"
                right={`${String(roster.length).padStart(2, '0')} total`}
              />
              {roster.length === 0 ? (
                <p className="p-3 font-sans text-read text-dim">Nobody inducted yet.</p>
              ) : (
                <ul className="divide-y divide-edge">
                  {roster.map((m) => {
                    const cold = m.daysSinceLast === null || m.daysSinceLast >= 14;
                    const drifting =
                      m.daysSinceLast !== null && m.daysSinceLast >= 7 && m.daysSinceLast < 14;
                    return (
                      <li key={m.fighterId} className="flex items-baseline gap-3 px-3 py-2.5">
                        <span
                          className={
                            cold
                              ? 'telemetry w-16 shrink-0 font-mono text-data font-bold text-fight'
                              : drifting
                                ? 'telemetry w-16 shrink-0 font-mono text-data font-bold text-gold'
                                : 'telemetry w-16 shrink-0 font-mono text-data text-dim'
                          }
                        >
                          {m.daysSinceLast === null ? 'never' : `${m.daysSinceLast}d`}
                        </span>
                        <span className="display min-w-0 flex-1 truncate text-h3 text-phosphor">
                          {m.name}
                        </span>
                        <span className="shrink-0 font-mono text-micro uppercase text-faint">
                          {m.sessions28d}/28d
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </main>
      <BottomNav />
    </>
  );
}
