import { Navigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/core/supabase';
import { api } from '@/data';
import type { User } from '@supabase/supabase-js';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  // Auth state (from Supabase, no AuthContext)
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) {
        setUser(null);
      } else {
        setUser(data?.user ?? null);
      }
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Access check (keeps your existing staff check)
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) {
        if (active) {
          setChecking(false);
          setAllowed(false);
        }
        return;
      }
      try {
        const me = await api.staff.me();
        if (!active) return;
        setAllowed(!!me && (me.status === 'active' || !me.status));
      } catch {
        if (!active) return;
        setAllowed(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  if (loading || checking) return <div className="p-6">Loading…</div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!allowed) return <Navigate to="/sign-in" replace state={{ noAccess: true }} />;
  return <>{children}</>;
}
