import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../core/supabase";

export type PingRow = { now: string; profile_count: number };

/**
 * Usage:
 *   // simplest: rely on the shared singleton
 *   await pingSupabase();
 *
 *   // or pass a specific client (optional)
 *   await pingSupabase(getSupabase());
 */
export async function pingSupabase(client?: SupabaseClient): Promise<PingRow | null> {
  const c = client ?? getSupabase();

  try {
    const { data: userData } = await c.auth.getUser();
    const user = userData.user ?? null;
    console.info("[PING] user_id=", user?.id ?? null, "email=", user?.email ?? null);

    // Type via fluent helper; works across supabase-js v2 variants
    const { data, error } = await c.rpc("__ping", {}).returns<PingRow[]>();
    if (error) throw error;

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

    console.info(
      "[PING] server_now=",
      row?.now ?? null,
      "profiles_count=",
      row?.profile_count ?? null
    );

    return row;
  } catch (err) {
    console.error("[PING][ERROR]", err);
    return null;
  }
}
