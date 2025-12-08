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

/* ---------- DEV-ONLY DIAGNOSTICS: trace any signOut caller ---------- */
type SignOutScope = 'others' | 'global' | 'current';
type ScopedSignOut = (opts?: { scope?: SignOutScope }) => Promise<unknown>;

if (import.meta.env.DEV) {
  const auth = _supabase.auth as unknown as {
    signOut?: ScopedSignOut;
    onAuthStateChange: typeof _supabase.auth.onAuthStateChange;
  };
  const original = auth.signOut?.bind(_supabase.auth) as ScopedSignOut | undefined;

  if (original) {
    auth.signOut = async (opts) => {
      console.groupCollapsed('[auth] signOut called', opts ?? {});
      console.trace();
      console.groupEnd();
      return original(opts);
    };
  }

  _supabase.auth.onAuthStateChange((event, session) => {
    console.log('[auth] state:', event, {
      uid: session?.user?.id,
      email: session?.user?.email,
    });
  });
}

// ---- Session Keeper: Proactive session refresh ----
// Keeps the session alive by refreshing before expiry
let sessionKeeperInterval: ReturnType<typeof setInterval> | null = null;
let lastRefreshAttempt = 0;

/**
 * Start the session keeper - refreshes session periodically to prevent expiry
 * Supabase tokens expire in 1 hour by default, we refresh every 45 minutes
 */
export function startSessionKeeper(): void {
  if (sessionKeeperInterval) return; // Already running

  const REFRESH_INTERVAL = 45 * 60 * 1000; // 45 minutes
  const MIN_REFRESH_GAP = 5 * 60 * 1000;   // Don't refresh more than once per 5 minutes

  const refreshSession = async () => {
    const now = Date.now();
    if (now - lastRefreshAttempt < MIN_REFRESH_GAP) {
      console.log('[session] Skipping refresh - too soon since last attempt');
      return;
    }

    try {
      lastRefreshAttempt = now;
      const { data: { session } } = await _supabase.auth.getSession();
      
      if (!session) {
        console.log('[session] No active session to refresh');
        return;
      }

      // Check if token expires in less than 15 minutes
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const timeUntilExpiry = expiresAt - now;
      
      if (timeUntilExpiry < 15 * 60 * 1000) {
        console.log('[session] Token expiring soon, refreshing...');
        const { error: refreshError } = await _supabase.auth.refreshSession();
        if (refreshError) {
          console.warn('[session] Refresh failed:', refreshError.message);
        } else {
          console.log('[session] Token refreshed successfully');
        }
      } else {
        console.log(`[session] Token still valid for ${Math.round(timeUntilExpiry / 60000)} minutes`);
      }
    } catch (err) {
      console.warn('[session] Error during refresh check:', err);
    }
  };

  // Initial check
  setTimeout(refreshSession, 5000); // Wait 5s for app to stabilize

  // Periodic refresh
  sessionKeeperInterval = setInterval(refreshSession, REFRESH_INTERVAL);

  // Refresh when tab becomes visible (user returns after being away)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('[session] Tab visible - checking session...');
      refreshSession();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Refresh on network reconnection
  const handleOnline = () => {
    console.log('[session] Network online - checking session...');
    setTimeout(refreshSession, 1000);
  };
  window.addEventListener('online', handleOnline);

  console.log('[session] Session keeper started');
}

/**
 * Stop the session keeper
 */
export function stopSessionKeeper(): void {
  if (sessionKeeperInterval) {
    clearInterval(sessionKeeperInterval);
    sessionKeeperInterval = null;
    console.log('[session] Session keeper stopped');
  }
}

// Auto-start session keeper when module loads
if (typeof window !== 'undefined') {
  startSessionKeeper();
  
  // Listen for auth errors and handle gracefully
  _supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') {
      console.log('[session] Token refreshed automatically');
      lastRefreshAttempt = Date.now();
    }
    
    if (event === 'SIGNED_OUT' && !session) {
      // Check if this was an unexpected sign out (not user-initiated)
      const wasUserInitiated = sessionStorage.getItem('athletrack:signout-initiated');
      if (!wasUserInitiated) {
        console.log('[session] Session ended unexpectedly - may have been revoked');
        // Could show a toast or redirect to sign-in here
      }
      sessionStorage.removeItem('athletrack:signout-initiated');
    }
  });
}

/**
 * Mark sign-out as user-initiated (call before supabase.auth.signOut)
 */
export function markSignOutInitiated(): void {
  sessionStorage.setItem('athletrack:signout-initiated', 'true');
}

// 🔹 Named + default export (some files might use either)
export const supabase = _supabase;

export function getClientId(): string {
  return globalThis.__athletrack_supabase_id__ ?? 'uninitialized';
}

/* ---------- Helpers for Edge Functions (absolute URL + headers) ---------- */
/**
 * Build the absolute URL to a Supabase Edge Function by name.
 * Example: getFunctionUrl('create_user') -> https://<ref>.supabase.co/functions/v1/create_user
 */
export function getFunctionUrl(name: string): string {
  return `${supabaseUrl}/functions/v1/${name}`;
}

/**
 * Returns headers appropriate for calling Edge Functions from the browser.
 * - Always includes `apikey` (required by Supabase)
 * - Includes `Authorization: Bearer <user JWT>` when signed in
 * - Falls back to `Authorization: Bearer <anon key>` when not signed in
 */
export async function getFunctionHeaders(extra?: Record<string, string>) {
  const { data } = await _supabase.auth.getSession();
  const token = data.session?.access_token || supabaseAnonKey;
  return {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    ...(extra ?? {}),
  };
}

export default supabase;
