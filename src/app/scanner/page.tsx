import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { ScannerClient } from './scanner-client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getDeclaredConditions } from '@/lib/data';

export const metadata = { title: 'GYM MODE // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default async function ScannerPage() {
  const liveVision = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  // Reads consoles, not plates — but the coach line is still free text from a
  // model, and "go smash a pre-workout" is exactly the kind of thing it says.
  const conditions = await getDeclaredConditions();

  return (
    <>
      <TopBar
        title="Gym Mode"
        subtitle="Equipment OCR // quick loot"
        demo={!isSupabaseConfigured}
        right={
          <span
            className={`border px-1.5 py-0.5 font-mono text-micro tracking-[0.15em] ${
              liveVision ? 'border-engage text-engage' : 'border-edge text-dim'
            }`}
          >
            {liveVision ? 'VISION LIVE' : 'VISION MOCK'}
          </span>
        }
      />
      <main className="mx-auto w-full max-w-md px-3 pb-24 pt-3">
        {/* Meal capture moved to /fuel/capture — this screen reads consoles only. */}
        <ScannerClient lockedMode="equipment_ocr" conditions={conditions} />
      </main>
      <BottomNav />
    </>
  );
}
