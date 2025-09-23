// src/services/profile.ts
import type { PostgrestError } from '@supabase/supabase-js';
import supabase from '@/core/supabase';

export type MyProfile = {
  full_name: string;
  email: string | null;
  pup_id: string | null;
  phone: string | null;
};

function mapRow(row: unknown): MyProfile {
  const r = (row ?? {}) as Partial<MyProfile>;
  return {
    full_name: r.full_name ?? '',
    email: r.email ?? null,
    pup_id: r.pup_id ?? null,
    phone: r.phone ?? null,
  };
}

function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  try {
    const pe = e as PostgrestError & { message?: string };
    return new Error(pe?.message ?? 'Unknown error');
  } catch {
    return new Error('Unknown error');
  }
}

/**
 * Reads the signed-in user's profile.
 * RLS: SELECT self policy (id = auth.uid()) must allow this.
 */
export async function getMyProfile(): Promise<MyProfile> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, pup_id, phone')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw asError(error);
  return mapRow(data ?? {});
}

/**
 * Updates the signed-in user's profile (except email).
 * @param patch full_name (required), pup_id (optional), phone (optional)
 */
export async function updateMyProfile(patch: {
  full_name: string;
  pup_id?: string | null;
  phone?: string | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('Not signed in');

  // Normalize payload
  const payload: {
    full_name: string;
    pup_id: string | null;
    phone: string | null;
  } = {
    full_name: (patch.full_name ?? '').trim(),
    pup_id: patch.pup_id ?? null,
    phone: patch.phone ?? null,
    // updated_at is auto-handled by trigger if present
  };

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId);

  if (error) throw asError(error);
}
