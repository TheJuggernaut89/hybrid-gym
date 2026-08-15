import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getFighter } from '@/lib/data';
import { InductionTerminal } from './induction-terminal';

export const metadata = { title: 'INDUCTION // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const fighter = isSupabaseConfigured ? await getFighter() : null;

  if (isSupabaseConfigured) {
    // Deliberately NOT `if (!fighter) redirect('/login')`.
    //
    // A signed-in user with no `fighters` row is a real state: it happens to
    // anyone who authenticated before `handle_new_user` existed, and running
    // the migrations afterwards does not backfill them. Redirecting to /login
    // trapped them — middleware bounces /login back to /now for any signed-in
    // user, /now redirects to /login on a null snapshot, and the member could
    // not reach a single screen, including sign-out.
    //
    // Onboarding is the correct destination for exactly this state: they are
    // authenticated, and completeInduction upserts, so filling the form
    // repairs the missing row.
    if (fighter?.onboarded) redirect('/hud');
  }

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-md px-3 py-6">
      <InductionTerminal
        demo={!isSupabaseConfigured}
        defaultName={fighter?.name && fighter.name !== 'UNNAMED' ? fighter.name : ''}
      />
    </main>
  );
}
