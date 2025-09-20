// src/services/pingSupabase.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/core/supabase';

export type PingRow = { now: string; profile_count: number };

/**
 * Usage:
 *   // rely on the shared singleton
 *   await pingSupabase();
 *
 *   // or pass a specific client (optional)
 *   await pingSupabase(supabase);
 */
export async function pingSupabase(client?: SupabaseClient): Promise<PingRow | null> {
  const c = client ?? supabase;

  try {
    const { data: userData, error: authErr } = await c.auth.getUser();
    if (authErr) {
      // not fatal for the ping — we still attempt the RPC
      console.warn('[PING] auth.getUser warning:', authErr.message);
    }
    const user = userData?.user ?? null;
    console.info('[PING] user_id=', user?.id ?? null, 'email=', user?.email ?? null);

    // Works across supabase-js v2 variants, typed via .returns<>
    const { data, error } = await c.rpc('__ping', {}).returns<PingRow[]>();
    if (error) throw error;

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

    console.info(
      '[PING] server_now=',
      row?.now ?? null,
      'profiles_count=',
      row?.profile_count ?? null
    );

    return row;
  } catch (err) {
    console.error('[PING][ERROR]', err);
    return null;
  }
}
