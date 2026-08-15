import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopBar } from '@/components/nav/top-bar';
import { BottomNav } from '@/components/nav/bottom-nav';
import { CaptureTabs } from './capture-tabs';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getDeclaredConditions } from '@/lib/data';

export const metadata = { title: 'LOG A MEAL // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default async function FuelCapturePage() {
  const liveVision = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const conditions = await getDeclaredConditions();

  return (
    <>
      <TopBar
        title="Log a meal"
        subtitle="Nutrition vision"
        demo={!isSupabaseConfigured}
        right={
          <span
            className={`border px-1.5 py-0.5 font-mono text-micro uppercase ${
              liveVision ? 'border-engage text-engage' : 'border-edge text-dim'
            }`}
          >
            {liveVision ? 'Vision live' : 'Vision mock'}
          </span>
        }
      />
      <main className="mx-auto w-full max-w-md px-3 pb-28 pt-3">
        <Link
          href="/fuel"
          className="mb-3 inline-flex min-h-11 items-center gap-1 font-mono text-micro uppercase text-dim hover:text-gold"
        >
          <ChevronLeft size={13} />
          Back to today
        </Link>
        <CaptureTabs conditions={conditions} />
      </main>
      <BottomNav />
    </>
  );
}
