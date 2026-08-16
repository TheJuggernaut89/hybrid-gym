import { redirect } from 'next/navigation';
import { getNowSnapshot, getGymMates, getOccupancy } from '@/lib/data';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  computeShields,
  computeTempo,
  activeProtection,
  PROTECTED_WINDOWS,
} from '@/lib/tempo';
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
    fighter, sessionDates, totalSessions, shieldsSpent, shieldCovers,
    declarations, gymSlots, demo,
    loads, declineReasons, classQuota, classesUsed,
  } = snapshot;
  if (isSupabaseConfigured && !fighter.onboarded) redirect('/onboarding');

  // Every window, not just the one active today: Raya ten days ago still sits
  // inside the trailing 28, and TEMPO said it was re-basing when it was not.
  // computeTempo clips them to the window itself.
  const tempo = computeTempo(sessionDates, new Date(), {
    shieldCovers,
    calendar: PROTECTED_WINDOWS,
  });
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
  const week = weekAhead(gymSlots)
    .filter((o) => !declaredTimes.has(o.at.getTime()))
    .slice(0, 8);

  // THE NOD and seat counts: one round trip each for the whole visible list
  // rather than one per row.
  const horizon = week.length ? week[week.length - 1].at : new Date();
  const [mates, occupancy] = week.length
    ? await Promise.all([
        getGymMates(new Date(), horizon),
        getOccupancy(new Date(), horizon),
      ])
    : [{}, {}];

  const options = week.map((o) => {
    const seats = occupancy[`${o.slot.id}@${o.at.toISOString()}`];
    return {
      gymSlotId: o.slot.id,
      className: o.slot.className,
      coachName: o.slot.coachName,
      durationMin: o.slot.durationMin,
      atISO: o.at.toISOString(),
      mates: mates[o.at.toISOString()] ?? [],
      taken: seats?.taken ?? null,
      capacity: seats?.capacity ?? null,
    };
  });

  // Existing members were onboarded before nicknames existed, and /now only
  // redirects to induction when !onboarded — so they would never be asked.
  // This is the backfill path.
  const askVisibility =
    isSupabaseConfigured &&
    !demo &&
    !(fighter as { nickname?: string | null }).nickname;

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
          askVisibility={askVisibility}
        />
        {/* Below the slot machinery: the member's next action is the booking
            they already made, not a recommendation to buy another one. */}
        <OfferPanel offers={offers} veto={veto} load={load} />
      </main>
      <BottomNav />
    </>
  );
}
