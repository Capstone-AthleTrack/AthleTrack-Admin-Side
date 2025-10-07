import { Navigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/core/supabase';
import type { User } from '@supabase/supabase-js';

type ProfileGateRow = {
  id?: string | null;
  email?: string | null;
  role: 'admin' | 'coach' | 'athlete' | 'user' | null;
  status: string | null;
} | null;

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false); // session known
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const isAllowedStatus = (s?: string | null) => {
    if (!s) return true; // legacy behavior when status is missing
    const v = s.toLowerCase();
    return v === 'accepted' || v === 'active';
  };

  // Robust auth bootstrap: getSession first, then subscribe
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Decide access using public.profiles (by id, then by email)
  useEffect(() => {
    let active = true;

    (async () => {
      if (!authReady) return;

      // No session -> deny
      if (!user) {
        if (active) {
          setAllowed(false);
          setChecking(false);
        }
        return;
      }

      const decide = (p: ProfileGateRow | null) => {
        const isAdmin = (p?.role ?? 'user') === 'admin';
        return isAdmin && isAllowedStatus(p?.status);
      };

      // 1) Try by auth user id
      try {
        const { data: byId, error: errId } = await supabase
          .from('profiles')
          .select('id,email,role,status')
          .eq('id', user.id)
          .maybeSingle<ProfileGateRow>();

        if (!active) return;

        if (!errId && byId) {
          const ok = decide(byId);
          setAllowed(ok);
          setChecking(false);
          // Debug: comment out if you don't want logs
          console.info('[ProtectedRoute] decision (by id)', {
            uid: user.id, role: byId?.role, status: byId?.status, ok
          });
          return;
        }
      } catch {
        /* fall through */
      }

      // 2) Fallback by email (covers rows keyed to another uuid)
      try {
        const email = user.email ?? '';
        if (email) {
          const { data: byEmail, error: errEmail } = await supabase
            .from('profiles')
            .select('id,email,role,status')
            .eq('email', email) // citext equality is case-insensitive
            .maybeSingle<ProfileGateRow>();

          if (!active) return;

          if (!errEmail && byEmail) {
            const ok = decide(byEmail);
            setAllowed(ok);
            setChecking(false);
            console.info('[ProtectedRoute] decision (by email)', {
              email, role: byEmail?.role, status: byEmail?.status, ok
            });
            return;
          }
        }
      } catch {
        /* fall through */
      }

      // No readable profile -> deny
      if (active) {
        setAllowed(false);
        setChecking(false);
        console.info('[ProtectedRoute] decision: no profile found / RLS blocked');
      }
    })();

    return () => {
      active = false;
    };
  }, [authReady, user]);

  if (!authReady || checking) return <div className="p-6">Loading…</div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!allowed) return <Navigate to="/sign-in" replace state={{ noAccess: true }} />;
  return <>{children}</>;
}
