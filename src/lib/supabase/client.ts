'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config';

export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — running in demo mode.');
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
