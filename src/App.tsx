import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

/* ── Public pages ── */
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ResetPassword from "./pages/ResetPassword";

/* ── Staff (protected) pages ── */
import Dashboard from "./pages/Dashboard";
import Sports from "./components/Sports";
import SportDetail from "./pages/SportsDetail";
import AthleteDetail from "./pages/AthleteDetail";
import UserManagement from "./pages/UserManagement";
import RequestManagement from "./pages/RequestManagement";
import Settings from "./pages/Settings";

/* ── shared supabase singleton ── */
import { supabase } from "@/core/supabase";

const isPupMail = (email?: string | null) =>
  !!email && email.toLowerCase().endsWith("@iskolarngbayan.pup.edu.ph");

/** Invisible route guard:
 * - must be signed in
 * - must be PUP webmail
 * - must have profiles.role='admin' AND (profiles.status='active' OR profiles.is_active=true)
 * Otherwise → redirect to /sign-in
 */
function RequireAdminActive({ children }: { children: ReactElement }): ReactElement | null {
  const [ready, setReady] = useState(false);
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || !session.user) {
        if (isMounted) { setRedirect("/sign-in"); setReady(true); }
        return;
      }

      if (!isPupMail(session.user.email)) {
        await supabase.auth.signOut().catch(() => {});
        if (isMounted) { setRedirect("/sign-in"); setReady(true); }
        return;
      }

      // NOTE: select both status and is_active to be compatible with older schema
      const { data: prof } = await supabase
        .from("profiles")
        .select("role,status,is_active")
        .eq("id", session.user.id)
        .maybeSingle();

      const isAdmin = prof?.role === "admin";
      const isActive =
        prof?.status === "active" ||
        (prof?.status == null && prof?.is_active === true);

      const ok = isAdmin && isActive;

      if (isMounted) {
        setRedirect(ok ? null : "/sign-in");
        setReady(true);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  if (!ready) return null;
  if (redirect) return <Navigate to={redirect} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Default → sign-in */}
      <Route path="/" element={<Navigate to="/sign-in" replace />} />

      {/* Public auth routes */}
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected staff routes (wrapped with invisible guard) */}
      <Route
        path="/dashboard"
        element={
          <RequireAdminActive>
            <Dashboard />
          </RequireAdminActive>
        }
      />
      <Route
        path="/sports"
        element={
          <RequireAdminActive>
            <Sports />
          </RequireAdminActive>
        }
      />
      <Route
        path="/sports/:sportName"
        element={
          <RequireAdminActive>
            <SportDetail />
          </RequireAdminActive>
        }
      />
      <Route
        path="/sports/:sportName/athletes/:athleteName"
        element={
          <RequireAdminActive>
            <AthleteDetail />
          </RequireAdminActive>
        }
      />
      <Route
        path="/user-management"
        element={
          <RequireAdminActive>
            <UserManagement />
          </RequireAdminActive>
        }
      />
      <Route
        path="/manage-requests"
        element={
          <RequireAdminActive>
            <RequestManagement />
          </RequireAdminActive>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAdminActive>
            <Settings />
          </RequireAdminActive>
        }
      />

      {/* Fallback → sign-in */}
      <Route path="*" element={<Navigate to="/sign-in" replace />} />
    </Routes>
  );
}
