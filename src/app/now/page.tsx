import { redirect } from 'next/navigation';
import { getNowSnapshot } from '@/lib/data';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { computeShields, computeTempo, activeProtection } from '@/lib/tempo';
import { nextSlot, lapsedSlots, weekAhead } from '@/lib/slots';
import { computeLoad, modalityMix } from '@/lib/session';
import { buildOffers, vetoAdvice } from '@/lib/offers';
import type { StatKey } from '@/lib/types';
import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { OfferPanel } from '@/components/coach/offer-panel';
import { NowClient } from './now-client';

export const metadata = { title: 'NOW // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default async function NowPage() {
  const snapshot = await getNowSnapshot();
  if (!snapshot) {
    // Authenticated but no fighter row yet — middleware already gated
    // unauthenticated traffic to /login, so sending them there again would
    // bounce straight back here and loop. Onboarding repairs the row.
    redirect('/onboarding');
  }

  const {
    fighter, sessionDates, totalSessions, shieldsSpent, declarations, gymSlots, demo,
    loads, declineReasons, classQuota, classesUsed,
  } = snapshot;
  if (isSupabaseConfigured && !fighter.onboarded) redirect('/onboarding');

  const tempo = computeTempo(sessionDates);
  const shields = computeShields(totalSessions, shieldsSpent);
  const protection = activeProtection();
  const upcoming = nextSlot(declarations);
  const lapsed = lapsedSlots(declarations);

  // Load first, offers second — buildOffers returns nothing at all when the
  // load model vetoes, so the commercial layer cannot out-argue the coaching.
  const load = computeLoad(loads);
  const offers = buildOffers({
    load,
    mix: modalityMix(loads.map((l) => ({ stat: l.stat as StatKey, load: l.load }))),
    tempo: tempo.current,
    classesIncluded: classQuota,
    classesUsed,
    declineReasons,
  });
  const veto = vetoAdvice(load);

  // Only offer timetable options the fighter hasn't already declared.
  const declaredTimes = new Set(
    declarations
      .filter((d) => d.status === 'declared')
      .map((d) => new Date(d.scheduledFor).getTime()),
  );
  const options = weekAhead(gymSlots)
    .filter((o) => !declaredTimes.has(o.at.getTime()))
    .slice(0, 8)
    .map((o) => ({
      gymSlotId: o.slot.id,
      className: o.slot.className,
      coachName: o.slot.coachName,
      durationMin: o.slot.durationMin,
      atISO: o.at.toISOString(),
    }));

  return (
    <>
      <TopBar title="Now" subtitle={`${fighter.name} // ${fighter.clan_tag}`} demo={demo} />
      <main className="mx-auto w-full max-w-md pb-28">
        <NowClient
          tempo={tempo}
          shields={shields}
          protection={protection}
          upcoming={upcoming}
          lapsed={lapsed}
          options={options}
        />
        {/* Below the slot machinery: the member's next action is the booking
            they already made, not a recommendation to buy another one. */}
        <OfferPanel offers={offers} veto={veto} load={load} />
      </main>
      <BottomNav />
    </>
  );
}
