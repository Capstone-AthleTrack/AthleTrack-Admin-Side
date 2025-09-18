import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/** Singleton Supabase client. */
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "athletrack-auth", // ← stable key
    },
  });
  return _client;
}
