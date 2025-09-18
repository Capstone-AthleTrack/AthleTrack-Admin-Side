import { Navigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/data';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) { setChecking(false); setAllowed(false); return; }
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
    return () => { active = false; };
  }, [user]);

  if (loading || checking) return <div className="p-6">Loading…</div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!allowed) return <Navigate to="/sign-in" replace state={{ noAccess: true }} />;
  return <>{children}</>;
}
