import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Camera } from 'lucide-react';
import { getHudSnapshot, sessionsThisWeek } from '@/lib/data';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  computeTargets,
  isToday,
  needsProfessionalNote,
  sumIntake,
} from '@/lib/nutrition';
import { screen } from '@/lib/contraindications';
import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { ScreenNotice } from '@/components/health/screen-notice';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SegmentMeter, UnitTag, HazardBar } from '@/components/ui/industrial';
import { cn } from '@/lib/utils';

export const metadata = { title: 'FUEL // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default async function FuelPage() {
  const snapshot = await getHudSnapshot();
  if (!snapshot) {
    // Authenticated but no fighter row yet — middleware already gated
    // unauthenticated traffic to /login, so sending them there again would
    // bounce straight back here and loop. Onboarding repairs the row.
    redirect('/onboarding');
  }

  const { fighter, nutrition, demo } = snapshot;
  if (isSupabaseConfigured && !fighter.onboarded) redirect('/onboarding');

  const today = nutrition.filter((n) => isToday(n.created_at));
  const target = computeTargets(fighter, sessionsThisWeek(snapshot));
  const eaten = sumIntake(today);

  const remaining = target.calories - eaten.calories;
  const over = remaining < 0;
  const caloriePct = (eaten.calories / Math.max(target.calories, 1)) * 100;

  // Screen both what the fighter logged AND what this page is about to
  // prescribe. `protein_target` is in the list because the number below is the
  // app's own recommendation — that is the one it is responsible for.
  const flags = screen({
    conditions: fighter.medical_conditions ?? [],
    subjects: [
      'protein_target',
      ...today.flatMap((m) => [m.dish_name ?? '', m.coach_comment ?? '']),
    ],
  });

  return (
    <>
      <TopBar
        title="Fuel"
        subtitle="Daily intake vs target"
        demo={demo}
        right={
          <span className="border border-edge px-1.5 py-0.5 font-mono text-micro uppercase text-dim">
            {target.goalLabel}
          </span>
        }
      />

      <main className="mx-auto w-full max-w-md pb-28">
        {/* ── HERO: what's left in the tank ─────────────────────────────── */}
        <section className="border-b border-edge px-3 pb-3 pt-4">
          <div className="font-mono text-micro uppercase text-faint">
            {over ? 'Calories over target' : 'Calories remaining'}
          </div>
          <div
            className={cn(
              'display text-hero leading-[0.78]',
              over ? 'text-fight' : 'text-gold',
            )}
          >
            {Math.abs(Math.round(remaining)).toLocaleString()}
          </div>

          <div className="mt-3">
            <SegmentMeter
              pct={Math.min(caloriePct, 100)}
              segments={28}
              tone={over ? 'fight' : caloriePct > 85 ? 'gold' : 'engage'}
            />
            <div className="mt-1.5 flex items-baseline justify-between font-mono text-micro uppercase">
              <span className="telemetry text-dim">
                {Math.round(eaten.calories).toLocaleString()}
                <span className="text-faint">
                  /{target.calories.toLocaleString()} KCAL
                </span>
              </span>
              <span className="text-faint">{Math.round(caloriePct)}% consumed</span>
            </div>
          </div>
        </section>

        {/* Sits above the macro cells, not below them — the flag has to reach
            the fighter before the number it qualifies. */}
        <ScreenNotice flags={flags} className="border-x-0 border-t-0" />

        {/* ── macros ────────────────────────────────────────────────────── */}
        <div className="rule-grid grid-cols-3 border-b border-edge">
          <MacroCell label="Protein" eaten={eaten.protein_g} target={target.protein_g} priority />
          <MacroCell label="Carbs" eaten={eaten.carbs_g} target={target.carbs_g} />
          <MacroCell label="Fats" eaten={eaten.fats_g} target={target.fats_g} />
        </div>

        <Link
          href="/fuel/capture"
          className="flex min-h-[60px] items-center justify-center gap-2 border-b border-edge bg-gold px-3 font-mono text-data font-bold uppercase tracking-[0.14em] text-canvas [touch-action:manipulation]"
        >
          <Camera size={16} />
          Log a meal
        </Link>

        <div className="space-y-3 p-3">
          {/* ── today's log ─────────────────────────────────────────────── */}
          <Panel>
            <PanelHeader
              label="Today's intake"
              right={`${String(today.length).padStart(2, '0')} logged`}
            />
            {today.length === 0 ? (
              <p className="p-3 font-mono text-read text-dim">
                Nothing logged today. Point the camera at your plate.
              </p>
            ) : (
              <ul className="divide-y divide-edge">
                {today.map((meal, i) => (
                  <li key={meal.id} className="px-3 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-micro text-faint" aria-hidden>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {/* Wraps rather than truncates — "Nasi Lemak (with fried
                          chicken)" losing its second half defeats the log. */}
                      <h3 className="display min-w-0 flex-1 text-h3 leading-[1.05] text-phosphor">
                        {meal.dish_name}
                      </h3>
                      <span className="telemetry shrink-0 font-mono text-data font-bold text-gold">
                        {Math.round(Number(meal.calories) || 0)}
                      </span>
                    </div>
                    <p className="telemetry mt-1 pl-6 font-mono text-meta uppercase text-dim">
                      P {Math.round(Number(meal.protein_g) || 0)}g · C{' '}
                      {Math.round(Number(meal.carbs_g) || 0)}g · F{' '}
                      {Math.round(Number(meal.fats_g) || 0)}g
                    </p>
                    {meal.coach_comment ? (
                      <p className="mt-1.5 border-l-2 border-edgeBright pl-2 font-mono text-read text-dim">
                        {meal.coach_comment}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* ── how the target was derived ──────────────────────────────── */}
          <Panel>
            <PanelHeader label="Target basis" accent="neutral" />
            <dl className="divide-y divide-edge">
              <BasisRow k="BMR (Mifflin-St Jeor)" v={`${target.bmr.toLocaleString()} kcal`} />
              <BasisRow
                k="Activity factor"
                v={`x${target.activityFactor} — ${sessionsThisWeek(snapshot)} sessions / 7d`}
              />
              <BasisRow k="Maintenance" v={`${target.tdee.toLocaleString()} kcal`} />
              <BasisRow
                k="Goal adjustment"
                v={
                  target.adjustmentPct === 0
                    ? 'None (maintenance)'
                    : `${Math.round(target.adjustmentPct * 100)}% — ${target.goalLabel}`
                }
              />
              <BasisRow
                k="Protein"
                v={`${target.protein_g}g (${target.adjustmentPct < 0 ? '2.0' : '1.8'} g/kg)`}
              />
            </dl>

            <div className="border-t border-edge px-3 py-2.5">
              <UnitTag label="Source" value="Onboarding biometrics" />
            </div>

            {target.estimated ? (
              <>
                <HazardBar tone="gold" />
                <p className="px-3 py-2.5 font-mono text-read text-gold">
                  Biometrics incomplete — defaults substituted. Finish your dossier for a
                  real number.
                </p>
              </>
            ) : null}

            {needsProfessionalNote(fighter) ? (
              <>
                <HazardBar />
                <div className="px-3 py-2.5">
                  <div className="font-mono text-micro uppercase text-fight">
                    Medical flag on file
                  </div>
                  <p className="mt-1 font-mono text-read text-phosphor">
                    You&rsquo;ve declared a condition that diet directly affects. These are
                    generic training estimates, not a plan for you — get the numbers signed
                    off by a doctor or dietitian before cutting.
                  </p>
                </div>
              </>
            ) : (
              <p className="border-t border-edge px-3 py-2.5 font-mono text-read text-dim">
                Estimates for training feedback, not clinical nutrition advice.
              </p>
            )}
          </Panel>
        </div>
      </main>

      <BottomNav />
    </>
  );
}

function MacroCell({
  label,
  eaten,
  target,
  priority = false,
}: {
  label: string;
  eaten: number;
  target: number;
  priority?: boolean;
}) {
  const pct = (eaten / Math.max(target, 1)) * 100;
  const over = pct > 105;
  // Protein is the one macro you want to *hit*, not stay under.
  const tone = over ? 'fight' : priority && pct >= 90 ? 'engage' : 'gold';

  return (
    <div className="bg-canvas px-2.5 py-2.5">
      <div className="font-mono text-micro uppercase text-faint">{label}</div>
      <div className="display telemetry mt-1 text-h3 text-phosphor">
        {Math.round(eaten)}
        <span className="font-mono text-micro text-faint">/{target}g</span>
      </div>
      <SegmentMeter pct={Math.min(pct, 100)} segments={8} tone={tone} className="mt-1.5 h-1.5" />
    </div>
  );
}

function BasisRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-2">
      <dt className="min-w-0 flex-1 font-mono text-micro uppercase text-faint">{k}</dt>
      <dd className="telemetry shrink-0 font-mono text-data text-dim">{v}</dd>
    </div>
  );
}
