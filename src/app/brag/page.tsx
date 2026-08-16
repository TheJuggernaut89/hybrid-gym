import { redirect } from 'next/navigation';
import { getHudSnapshot } from '@/lib/data';
import { levelProgress } from '@/lib/xp';
import { crestForLevel } from '@/lib/xp';
import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { BragStudio } from './brag-studio';

export const metadata = { title: 'BRAG // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default async function BragPage() {
  const snapshot = await getHudSnapshot();
  if (!snapshot) {
    // Authenticated but no fighter row yet — middleware already gated
    // unauthenticated traffic to /login, so sending them there again would
    // bounce straight back here and loop. Onboarding repairs the row.
    redirect('/onboarding');
  }

  const { fighter, workouts, homeSessions, demo } = snapshot;
  const progress = levelProgress(fighter.total_xp);
  const crest = crestForLevel(fighter.level);

  const weekMs = Date.now() - 7 * 86_400_000;
  const weekWorkouts = workouts.filter((w) => new Date(w.created_at).getTime() >= weekMs);
  const weekHome = homeSessions.filter((h) => new Date(h.created_at).getTime() >= weekMs);

  const bestForm = homeSessions.reduce(
    (max, h) => Math.max(max, Math.round(Number(h.form_accuracy_score))),
    0,
  );

  return (
    <>
      <TopBar title="BRAGGING RIGHTS" subtitle="STORY CARD GENERATOR" demo={demo} />
      <main className="mx-auto w-full max-w-md px-3 pb-24 pt-3">
        <BragStudio
          card={{
            name: fighter.name,
            clan: fighter.clan_tag,
            level: fighter.level,
            totalXp: fighter.total_xp,
            levelPct: progress.pct,
            tierName: crest.name,
            tierColor: crest.color,
            weekCalories: Math.round(
              weekWorkouts.reduce((sum, w) => sum + (w.calories ?? 0), 0),
            ),
            weekMinutes: Math.round(
              weekWorkouts.reduce((sum, w) => sum + (w.active_minutes ?? 0), 0),
            ),
            weekDrills: weekHome.length,
            bestForm,
          }}
        />
      </main>
      <BottomNav />
    </>
  );
}
