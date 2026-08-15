import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { DojoClient } from './dojo-client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getDeclaredConditions, getTechniqueProgress } from '@/lib/data';

export const metadata = { title: 'FORM CHECK // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default async function HomeBasePage() {
  const [progress, conditions] = await Promise.all([
    getTechniqueProgress(),
    getDeclaredConditions(),
  ]);

  return (
    <>
      <TopBar
        title="Form Check"
        subtitle="Camera watches your reps // on-device"
        demo={!isSupabaseConfigured}
      />
      <main className="mx-auto w-full max-w-md px-3 pb-24 pt-3">
        <DojoClient progress={progress} conditions={conditions} />
      </main>
      <BottomNav />
    </>
  );
}
