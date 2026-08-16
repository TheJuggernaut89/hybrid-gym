import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Flame, PlusSquare, Share2 } from 'lucide-react';
import { getHudSnapshot } from '@/lib/data';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { computeBountyProgress } from '@/lib/bounties';
import { levelProgress, radarAxes } from '@/lib/xp';
import { formatDuration } from '@/lib/utils';
import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Disclosure } from '@/components/ui/disclosure';
import { Stat } from '@/components/ui/stat';
import { SegmentMeter, UnitTag, HazardBar } from '@/components/ui/industrial';
import { RadarChart } from '@/components/hud/radar-chart';
import { BullCrest } from '@/components/hud/crest';
import { BountyList } from '@/components/hud/bounty-list';

export const metadata = { title: 'HUD // HYBRID COMBATIVE' };
export const dynamic = 'force-dynamic';

/** Where a session happened, in the gym's own words. */
const SESSION_KIND: Record<string, string> = {
  combat: 'MAT',
  class: 'MAT',
  skill: 'MAT',
  lift: 'FLOOR',
  power: 'FLOOR',
  conditioning: 'ENGINE',
  mobility: 'RECOVER',
};

export default async function HudPage() {
  const snapshot = await getHudSnapshot();

  if (!snapshot) {
    // Authenticated but no fighter row yet — middleware already gated
    // unauthenticated traffic to /login, so sending them there again would
    // bounce straight back here and loop. Onboarding repairs the row.
    redirect('/onboarding');
  }

  const { fighter, workouts, homeSessions, trainingSessions, bounties, demo } = snapshot;
  if (isSupabaseConfigured && !fighter.onboarded) redirect('/onboarding');

  const progress = levelProgress(fighter.total_xp);
  const axes = radarAxes(fighter);
  // trainingSessions was omitted here, so every load- and session-counting
  // bounty read zero for a member who trains by turning up to class.
  const bountyProgress = computeBountyProgress(
    bounties,
    workouts,
    homeSessions,
    trainingSessions,
  );

  const feed = [
    ...workouts.map((w) => ({
      id: w.id,
      at: w.created_at,
      kind: 'GYM' as const,
      title: w.equipment_type.replace(/_/g, ' '),
      detail: `${Math.round(w.calories ?? 0)} kcal · ${Math.round(w.active_minutes ?? 0)} min`,
      xp: w.xp_awarded,
      comment: w.coach_comment,
    })),
    ...homeSessions.map((h) => ({
      id: h.id,
      at: h.created_at,
      kind: 'FORM' as const,
      title: h.drill_name,
      detail: `${h.rep_count} reps · ${formatDuration(h.duration_seconds)} · ${Math.round(
        Number(h.form_accuracy_score),
      )}% form`,
      xp: h.xp_awarded,
      comment: h.corrective_action,
    })),
    // The mats and the weights floor. Absent from this list until now, so the
    // members who train the way the gym most wants them to — by turning up —
    // saw an empty log.
    ...trainingSessions.map((t) => ({
      id: t.id,
      at: t.created_at,
      kind: SESSION_KIND[t.session_type] ?? 'FLOOR',
      title: t.label ?? t.session_type,
      detail: `${t.duration_min} min · RPE ${t.rpe} · ${t.load_au} AU`,
      xp: t.load_au,
      comment: null,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  return (
    <>
      <TopBar title={fighter.name} subtitle={`Clan ${fighter.clan_tag}`} demo={demo} />

      <main className="mx-auto w-full max-w-md pb-28">
        {/* ── HERO: the level numeral is the loudest object in the app ───── */}
        <section className="relative border-b border-edge px-3 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-micro uppercase text-faint">Operator level</div>
              <div className="display text-hero leading-[0.78] text-gold">{fighter.level}</div>
            </div>
            <BullCrest level={fighter.level} size={72} />
          </div>

          <div className="mt-3">
            <SegmentMeter pct={progress.pct} segments={28} />
            <div className="mt-1.5 flex items-baseline justify-between font-mono text-micro uppercase">
              <span className="telemetry text-dim">
                {progress.intoLevel.toLocaleString()}
                <span className="text-faint">/{progress.levelSpan.toLocaleString()} XP</span>
              </span>
              <span className="text-faint">
                {progress.toNext.toLocaleString()} to L{fighter.level + 1}
              </span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-edge pt-2">
            <UnitTag label="Total XP" value={fighter.total_xp.toLocaleString()} />
            {/* BRAG lost its nav slot — a weekly action doesn't earn 25% of the
                bottom bar. It lives here, next to the thing you'd brag about. */}
            <Link
              href="/brag"
              className="-my-1 inline-flex min-h-11 items-center gap-1.5 py-1 font-mono text-micro uppercase text-dim hover:text-gold [touch-action:manipulation]"
            >
              <Share2 size={12} />
              Brag card
            </Link>
          </div>
        </section>

        {/* ── primary actions ───────────────────────────────────────────── */}
        <div className="rule-grid grid-cols-2 border-b border-edge">
          <Link
            href="/train"
            className="flex min-h-[60px] items-center justify-center gap-2 bg-gold px-3 font-mono text-data font-bold uppercase tracking-[0.14em] text-canvas [touch-action:manipulation]"
          >
            <PlusSquare size={16} />
            Train
          </Link>
          <Link
            href="/fuel"
            className="flex min-h-[60px] items-center justify-center gap-2 bg-canvas px-3 font-mono text-data font-bold uppercase tracking-[0.14em] text-phosphor hover:text-gold [touch-action:manipulation]"
          >
            <Flame size={16} />
            Log a meal
          </Link>
        </div>

        <div className="space-y-3 p-3">
          <Panel>
            <PanelHeader label="Combat profile" right="Normalised 0-100" />
            <div className="px-2 pb-2 pt-3">
              <RadarChart axes={axes} />
            </div>
          </Panel>

          {/* StreakTracker removed: TEMPO on /now replaces it. A streak that can
              hit zero is a churn detonator, and this screen is no longer the
              landing surface anyway. */}

          <BountyList bounties={bountyProgress} />

          {/* ── dossier ─────────────────────────────────────────────────── */}
          <Disclosure label="Fighter dossier" count="Biometrics">
            <div className="rule-grid grid-cols-4">
              <Stat label="Age" value={fighter.biological_data.age ?? '—'} />
              <Stat label="Weight" value={fighter.biological_data.weight_kg ?? '—'} unit="KG" />
              <Stat label="Height" value={fighter.biological_data.height_cm ?? '—'} unit="CM" />
              <Stat label="Shields" value={fighter.rest_shields} accent="engage" />
            </div>

            {fighter.medical_conditions.length > 0 ? (
              <>
                <HazardBar />
                <div className="px-3 py-2.5">
                  <div className="font-mono text-micro uppercase text-fight">Medical flags</div>
                  <p className="mt-1 font-sans text-read text-phosphor">
                    {fighter.medical_conditions.join(' · ')}
                  </p>
                </div>
              </>
            ) : null}

            {fighter.goals.length > 0 ? (
              <div className="border-t border-edge px-3 py-2.5">
                <div className="font-mono text-micro uppercase text-faint">Objectives</div>
                <p className="mt-1 font-sans text-read text-dim">
                  {fighter.goals.join(' · ')}
                </p>
              </div>
            ) : null}
          </Disclosure>

          {/* ── combat log ──────────────────────────────────────────────── */}
          <Disclosure
            label="Combat log"
            count={`${String(feed.length).padStart(2, '0')} entries`}
          >
            {feed.length === 0 ? (
              <p className="p-3 font-sans text-read text-dim">
                Nothing logged yet. Take a class, lift something, or scan a machine.
              </p>
            ) : (
              <ul className="divide-y divide-edge">
                {feed.map((entry) => (
                  <li key={entry.id} className="px-3 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={
                          entry.kind === 'GYM'
                            ? 'shrink-0 font-mono text-micro text-gold'
                            : 'shrink-0 font-mono text-micro text-engage'
                        }
                      >
                        {entry.kind}
                      </span>
                      <h3 className="display min-w-0 flex-1 truncate text-h3 text-phosphor">
                        {entry.title}
                      </h3>
                      <span className="telemetry shrink-0 font-mono text-data font-bold text-gold">
                        +{entry.xp}
                      </span>
                    </div>
                    <p className="telemetry mt-1 font-mono text-meta uppercase text-dim">
                      {entry.detail}
                    </p>
                    {entry.comment ? (
                      <p className="mt-1.5 border-l-2 border-edgeBright pl-2 font-sans text-read text-dim">
                        {entry.comment}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>
        </div>
      </main>

      <BottomNav />
    </>
  );
}
