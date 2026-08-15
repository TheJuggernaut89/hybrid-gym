import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { LogClient } from './log-client';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const metadata = { title: 'LOG A SESSION // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default function LogPage() {
  return (
    <>
      <TopBar
        title="Log a session"
        subtitle="Any training // any modality"
        demo={!isSupabaseConfigured}
      />
      <main className="mx-auto w-full max-w-md px-3 pb-28 pt-3">
        <LogClient />
      </main>
      <BottomNav />
    </>
  );
}
