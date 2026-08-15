import { isSupabaseConfigured } from '@/lib/supabase/config';
import { LoginTerminal } from './login-terminal';
import Link from 'next/link';

export const metadata = { title: 'ACCESS // HYBRID HUD' };
export const dynamic = 'force-dynamic';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center border border-gold text-gold">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7C4 4.5 6 3.5 8 4.5" />
              <path d="M20 7C20 4.5 18 3.5 16 4.5" />
              <path d="M8 4.5V9c0 4 2 7 4 9 2-2 4-5 4-9V4.5" />
            </svg>
          </div>
          <h1 className="mt-4 text-h1 text-phosphor">HYBRID COMBATIVE</h1>
          <p className="font-mono text-meta tracking-[0.3em] text-gold">PLAYER HUD // DAMANSARA</p>
        </div>

        {isSupabaseConfigured ? (
          <LoginTerminal next={searchParams.next} initialError={searchParams.error} />
        ) : (
          <div className="border border-edge bg-surface p-5">
            <h2 className="text-h2 text-fight">DEMO MODE ACTIVE</h2>
            <p className="mt-2 font-mono text-data leading-relaxed text-dim">
              No Supabase credentials found. Auth is bypassed and a mock fighter is served.
              Set <span className="text-gold">NEXT_PUBLIC_SUPABASE_URL</span> and{' '}
              <span className="text-gold">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> in{' '}
              <span className="text-gold">.env.local</span> to enable real accounts.
            </p>
            <Link
              href="/hud"
              className="mt-5 flex w-full items-center justify-center border border-gold bg-gold px-4 py-3 text-read font-bold uppercase tracking-[0.18em] text-canvas"
            >
              Enter HUD
            </Link>
          </div>
        )}

        <p className="mt-6 text-center font-mono text-micro tracking-[0.2em] text-faint">
          NO ADS. NO FLUFF. JUST WORK.
        </p>
      </div>
    </main>
  );
}
