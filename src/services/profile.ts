// src/services/profile.ts
import type { PostgrestError } from '@supabase/supabase-js';
import supabase from '@/core/supabase';

export type MyProfile = {
  full_name: string;
  email: string | null;
  pup_id: string | null;
  phone: string | null;
};

function mapRow(row: unknown, authEmail: string | null): MyProfile {
  const r = (row ?? {}) as Partial<MyProfile>;
  return {
    full_name: r.full_name ?? '',
    // Source of truth for email is Auth; do not rely on public.profiles
    email: authEmail,
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
 * - Email is taken from Auth (read-only), not from public.profiles
 * - RLS: SELECT self policy (id = auth.uid()) must allow this.
 */
export async function getMyProfile(): Promise<MyProfile> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;
  const authEmail = auth?.user?.email ?? null;
  if (!userId) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, pup_id, phone') // intentionally exclude "email" to avoid accidental writes/reads
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw asError(error);
  return mapRow(data ?? {}, authEmail);
}

/**
 * Updates the signed-in user's profile (except email).
 * Uses a pure UPDATE (no upsert) and only touches the allowed columns,
 * which avoids tripping unrelated CHECK constraints (e.g., sport/team).
 *
 * @param patch full_name (required), pup_id (optional), phone (optional)
 */
export async function updateMyProfile(patch: {
  full_name: string;
  pup_id?: string | null;
  phone?: string | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;
  if (!userId) throw new Error('Not signed in');

  // Build payload with only the columns we are allowed to update
  const payload: {
    full_name: string;
    pup_id?: string | null;
    phone?: string | null;
  } = {
    full_name: (patch.full_name ?? '').trim(),
  };
  // Only include optional fields if explicitly provided; this prevents
  // PostgREST from touching other columns referenced by CHECK constraints.
  if (patch.pup_id !== undefined) payload.pup_id = patch.pup_id ?? null;
  if (patch.phone !== undefined) payload.phone = patch.phone ?? null;

  const { error } = await supabase
    .from('profiles')
    .update(payload) // no 'returning' option — keep types compatible with current client
    .eq('id', userId);

  if (error) throw asError(error);
}
