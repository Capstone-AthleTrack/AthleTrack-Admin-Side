// src/core/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---- Env (Vite) ------------------------------------------------------------
export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

function assertValidEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '[supabase] Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY.\n' +
        'Add them in .env.local (Project settings → API in Supabase dashboard).'
    );
  }
  // Must be a hosted Supabase project like https://xxxx.supabase.co
  let host = '';
  try {
    const u = new URL(supabaseUrl);
    host = u.host;
  } catch {
    throw new Error(
      `[supabase] VITE_SUPABASE_URL is not a valid URL: "${supabaseUrl}". ` +
        'Use your project URL like "https://<project-ref>.supabase.co".'
    );
  }
  if (!/\.supabase\.co$/i.test(host)) {
    throw new Error(
      `[supabase] VITE_SUPABASE_URL must point to your Supabase project (https://<ref>.supabase.co), ` +
        `but is "${supabaseUrl}". If you see requests to http://localhost:5173/functions, this is the cause.`
    );
  }
}
assertValidEnv();

// ---- HMR-safe globals (avoid multiple GoTrue clients in dev) ---------------
declare global {
  var __athletrack_supabase__: SupabaseClient | undefined;
  var __athletrack_supabase_id__: string | undefined;
}

// ---- Singleton client ------------------------------------------------------
const _supabase: SupabaseClient =
  globalThis.__athletrack_supabase__ ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storageKey: 'athletrack-auth-v1',
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    // Ensure API key is always present on REST/Functions calls
    global: {
      headers: { apikey: supabaseAnonKey },
    },
    db: { schema: 'public' },
  });

if (!globalThis.__athletrack_supabase__) {
  globalThis.__athletrack_supabase__ = _supabase;
  globalThis.__athletrack_supabase_id__ =
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '') ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// 🔹 Named + default export (some files might use either)
export const supabase = _supabase;

export function getClientId(): string {
  return globalThis.__athletrack_supabase_id__ ?? 'uninitialized';
}

export default supabase;
