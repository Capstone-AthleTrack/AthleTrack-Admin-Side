// src/core/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Prefer Vite envs
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // Optional: throw to surface misconfig early
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// HMR-safe singleton (prevents multiple GoTrueClient instances)
declare global {
  var __athletrack_supabase__: SupabaseClient | undefined;
}

export const supabase: SupabaseClient =
  globalThis.__athletrack_supabase__ ??
  createClient(url, anon, {
    auth: {
      persistSession: true,
      // Use a unique storage key so only THIS client reads/writes this session
      storageKey: 'athletrack-auth-v1',
    },
  });

if (!globalThis.__athletrack_supabase__) {
  globalThis.__athletrack_supabase__ = supabase;
}

export default supabase;
