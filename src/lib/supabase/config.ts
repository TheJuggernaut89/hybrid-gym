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

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000';
