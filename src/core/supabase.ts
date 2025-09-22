// src/core/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---- Env (Vite) ------------------------------------------------------------
export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

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
    // Belt & suspenders: ensure apikey is always present on REST calls
    // (supabase-js adds it by default, this guarantees it even if customized)
    global: {
      headers: {
        apikey: supabaseAnonKey,
      },
    },
    db: {
      schema: 'public',
    },
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
