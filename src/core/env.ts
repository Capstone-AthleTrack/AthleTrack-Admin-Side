// src/core/env.ts
export const env = Object.freeze({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim(),
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
});

if (!env.supabaseUrl || !env.supabaseAnonKey) {
  throw new Error(
    'Missing Supabase envs. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local'
  );
}
