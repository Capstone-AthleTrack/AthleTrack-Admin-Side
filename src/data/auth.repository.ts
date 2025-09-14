import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/core/supabase';

export async function signIn(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  return { ok: !error, error: error?.message };
}

export async function signUp(email: string, password: string) {
  const { error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  return { ok: !error, error: error?.message };
}

export async function signOut() {
  await getSupabase().auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session ?? null;
}

export function onAuthStateChange(cb: (user: User | null, session: Session | null) => void) {
  const { data } = getSupabase().auth.onAuthStateChange((_evt, session) => {
    cb(session?.user ?? null, session ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function getUser() {
  const { data } = await getSupabase().auth.getUser();
  return data.user ?? null;
}
