import { Navigate } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';

/* Use the same default import style as the rest of the app (e.g., SignIn.tsx) */
import supabase from '@/core/supabase';

type ProfileGateRow = {
  id?: string | null;
  email?: string | null;
  role: 'admin' | 'coach' | 'athlete' | 'user' | null;
  status: string | null;
  /** legacy boolean used by older builds */
  is_active?: boolean | null;
} | null;

/** Gmail-only helper (client-side UX guard; DB also enforces) */
const isGmail = (e?: string | null) =>
  !!e && e.toLowerCase().trim().endsWith('@gmail.com');

// ---- Offline Auth Cache ----
const AUTH_CACHE_KEY = 'athletrack:auth:profile';

interface CachedAuthProfile {
  userId: string;
  email: string;
  role: string;
  status: string;
  isActive: boolean;
  allowed: boolean;
  cachedAt: number;
}

function getCachedAuth(): CachedAuthProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedAuthProfile;
  } catch {
    return null;
  }
}

function setCachedAuth(profile: CachedAuthProfile): void {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function clearCachedAuth(): void {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // ignore
  }
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  /** We use a two-step hydration to avoid redirect "bounces" right after sign-in */
  const [gotInitialSession, setGotInitialSession] = useState(false);
  const [gotAuthEvent, setGotAuthEvent] = useState(false);

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  /** Small grace window after hydration to let the session fully settle */
  const GRACE_MS = 700;
  const graceTimer = useRef<number | null>(null);

  const isAllowedStatus = (s?: string | null) => {
    if (!s) return true; // legacy behavior when status is missing
    const v = s.toLowerCase();
    return v === 'accepted' || v === 'active';
  };

  // Robust auth bootstrap: read current session, then subscribe to changes.
  // We mark two separate flags so we can wait for hydration before deciding.
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setGotInitialSession(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setGotAuthEvent(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Decide access using public.profiles (by id, then by email), but only after hydration and a short grace delay.
  // Now with offline support: falls back to cached auth if network is unavailable.
  useEffect(() => {
    let active = true;

    // If nothing is hydrated yet, keep loading.
    const hydrated = gotInitialSession || gotAuthEvent;
    if (!hydrated) {
      setChecking(true);
      return () => {
        active = false;
      };
    }

    // Start/refresh a short grace timer to avoid racey redirects immediately after sign-in.
    if (graceTimer.current) {
      window.clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
    graceTimer.current = window.setTimeout(() => {
      (async () => {
        if (!active) return;

        // No session -> deny
        if (!user) {
          clearCachedAuth();
          setAllowed(false);
          setChecking(false);
          return;
        }

        // Gmail-only gate: deny access (let main.tsx own the actual signOut to avoid races)
        if (!isGmail(user.email ?? '')) {
          clearCachedAuth();
          setAllowed(false);
          setChecking(false);
          console.info('[ProtectedRoute] blocked non-gmail session:', user.email);
          return;
        }

        const decide = (p: ProfileGateRow | null) => {
          const isAdmin = (p?.role ?? 'user') === 'admin';
          const okStatus = isAllowedStatus(p?.status) || !!p?.is_active; // accept legacy is_active=true
          return isAdmin && okStatus;
        };

        // Helper to use cached auth when offline
        const useCachedAuthIfAvailable = (): boolean => {
          const cached = getCachedAuth();
          if (cached && cached.userId === user.id) {
            console.info('[ProtectedRoute] using cached auth (offline)', cached);
            setAllowed(cached.allowed);
            setChecking(false);
            return true;
          }
          return false;
        };

        // 1) Try by auth user id
        try {
          const { data: byId, error: errId } = await supabase
            .from('profiles')
            .select('id,email,role,status,is_active')
            .eq('id', user.id)
            .maybeSingle<ProfileGateRow>();

          if (!active) return;

          if (!errId && byId) {
            const ok = decide(byId);
            // Cache the auth result for offline use
            setCachedAuth({
              userId: user.id,
              email: user.email ?? '',
              role: byId?.role ?? 'user',
              status: byId?.status ?? '',
              isActive: !!byId?.is_active,
              allowed: ok,
              cachedAt: Date.now(),
            });
            setAllowed(ok);
            setChecking(false);
            console.info('[ProtectedRoute] decision (by id)', {
              uid: user.id,
              role: byId?.role,
              status: byId?.status,
              is_active: byId?.is_active,
              ok,
            });
            return;
          }
        } catch (err) {
          // Network error - try cached auth
          console.warn('[ProtectedRoute] network error on id lookup:', err);
          if (useCachedAuthIfAvailable()) return;
          /* fall through */
        }

        // 2) Fallback by email (covers rows keyed to another uuid)
        try {
          const email = user.email ?? '';
          if (email) {
            const { data: byEmail, error: errEmail } = await supabase
              .from('profiles')
              .select('id,email,role,status,is_active')
              .eq('email', email) // citext equality is case-insensitive
              .maybeSingle<ProfileGateRow>();

            if (!active) return;

            if (!errEmail && byEmail) {
              const ok = decide(byEmail);
              // Cache the auth result for offline use
              setCachedAuth({
                userId: user.id,
                email: email,
                role: byEmail?.role ?? 'user',
                status: byEmail?.status ?? '',
                isActive: !!byEmail?.is_active,
                allowed: ok,
                cachedAt: Date.now(),
              });
              setAllowed(ok);
              setChecking(false);
              console.info('[ProtectedRoute] decision (by email)', {
                email,
                role: byEmail?.role,
                status: byEmail?.status,
                is_active: byEmail?.is_active,
                ok,
              });
              return;
            }
          }
        } catch (err) {
          // Network error - try cached auth
          console.warn('[ProtectedRoute] network error on email lookup:', err);
          if (useCachedAuthIfAvailable()) return;
          /* fall through */
        }

        // 3) Last resort: try cached auth before denying
        if (useCachedAuthIfAvailable()) return;

        // No readable profile -> deny
        setAllowed(false);
        setChecking(false);
        console.info('[ProtectedRoute] decision: no profile found / RLS blocked');
      })();
    }, GRACE_MS) as unknown as number;

    return () => {
      active = false;
      if (graceTimer.current) {
        window.clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };
  }, [gotInitialSession, gotAuthEvent, user]);

  // While waiting for hydration or the grace window, render a tiny loader.
  const authReady = gotInitialSession || gotAuthEvent;
  if (!authReady || checking) return <div className="p-6">Loading…</div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!allowed) return <Navigate to="/sign-in" replace state={{ noAccess: true }} />;
  return <>{children}</>;
}
