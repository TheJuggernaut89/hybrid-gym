const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/**
 * When Supabase env vars are absent the whole app drops into DEMO MODE:
 * auth is bypassed, a mock fighter is served, and writes are no-ops that
 * report themselves. This keeps `npm run dev` usable with zero setup.
 */
export const isSupabaseConfigured = Boolean(url && anon);

export const SUPABASE_URL = url ?? '';
export const SUPABASE_ANON_KEY = anon ?? '';

/**
 * Where magic links come back to.
 *
 * Server-side this can only come from the env var. In the BROWSER, prefer the
 * real origin: it is always correct, and it cannot silently rot the way a
 * hand-typed env var does.
 *
 * That ordering matters because the failure is invisible. Forget to set
 * NEXT_PUBLIC_SITE_URL on the host and every login email points at
 * http://localhost:3000 — the app looks fully deployed, and the member gets
 * "localhost refused to connect" from an email they opened on their phone.
 */
export function siteUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000';
}

/** @deprecated Prefer `siteUrl()` — this is evaluated at import time and cannot see the browser origin. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000';
