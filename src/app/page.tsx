import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getFighter } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  // NOW is the landing surface, not the scoreboard.
  if (!isSupabaseConfigured) redirect('/now');

  const fighter = await getFighter();
  // See the note in now/page.tsx — /login would loop via middleware.
  if (!fighter) redirect('/onboarding');
  if (!fighter.onboarded) redirect('/onboarding');
  redirect('/now');
}
