import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { TrainClient } from './train-client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getDeclaredConditions, getNowSnapshot } from '@/lib/data';
import { weekAhead } from '@/lib/slots';

export const metadata = { title: 'TRAIN // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default async function TrainPage() {
  const [conditions, snapshot] = await Promise.all([
    getDeclaredConditions(),
    getNowSnapshot(),
  ]);

  // Only what is still to come TODAY. A plan for today should not advertise
  // Thursday, nor a class that started an hour ago.
  const now = new Date();
  const todaysClasses = (snapshot ? weekAhead(snapshot.gymSlots) : [])
    .filter((o) => o.at.toDateString() === now.toDateString() && o.at > now)
    .slice(0, 4)
    .map((o) => ({
      className: o.slot.className,
      coachName: o.slot.coachName,
      at: o.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    }));

  return (
    <>
      <TopBar
        title="Train"
        subtitle="Plan it // or record it"
        demo={!isSupabaseConfigured}
      />
      <main className="mx-auto w-full max-w-md px-3 pb-28 pt-3">
        <TrainClient conditions={conditions} todaysClasses={todaysClasses} />
      </main>
      <BottomNav />
    </>
  );
}
