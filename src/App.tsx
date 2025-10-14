import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { recordSessionStart } from "@/utils/telemetry";
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
import supabase from "@/core/supabase";

/* Require ONLY official PUP staff domain for admin-side access */
const isPupMail = (email?: string | null) => {
  const e = (email ?? "").toLowerCase();
  return e.endsWith("@pup.edu.ph");
};

type ProfileRowLite = {
  role: "admin" | "coach" | "athlete" | "user" | null;
  status: string | null;
  is_active?: boolean | null; // legacy support
  email?: string | null;
} | null;

/** Invisible route guard:
 * - must be signed in
 * - must be PUP webmail
 * - must have profiles.role='admin' AND status IN ('accepted','active')  (or legacy is_active=true)
 * Otherwise → redirect to /sign-in
 */
function RequireAdminActive({ children }: { children: ReactElement }): ReactElement | null {
  const [ready, setReady] = useState(false);
  const [redirect, setRedirect] = useState<string | null>(null);

  // helper: accept new and legacy status values
  const isAllowedStatus = (status?: string | null, legacyIsActive?: boolean | null) => {
    const v = (status ?? "").toLowerCase();
    if (v === "accepted" || v === "active") return true;
    if (!status && legacyIsActive === true) return true; // very old schema
    return false;
  };

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

      // Try profile by id first
      let role: string | null | undefined = null;
      let status: string | null | undefined = null;
      let legacyIsActive: boolean | null | undefined = null;

      try {
        const { data: byId } = await supabase
          .from("profiles")
          .select("role,status,is_active,email")
          .eq("id", session.user.id)
          .maybeSingle();

        const byIdRow = byId as ProfileRowLite;
        if (byIdRow) {
          role = byIdRow.role;
          status = byIdRow.status;
          legacyIsActive = byIdRow.is_active ?? null;
        } else {
          // Fallback: profile by email (covers older rows keyed to a different uuid)
          const email = session.user.email ?? "";
          if (email) {
            const { data: byEmail } = await supabase
              .from("profiles")
              .select("role,status,is_active,email")
              .eq("email", email)
              .maybeSingle();

            const byEmailRow = byEmail as ProfileRowLite;
            if (byEmailRow) {
              role = byEmailRow.role;
              status = byEmailRow.status;
              legacyIsActive = byEmailRow.is_active ?? null;
            }
          }
        }
      } catch {
        // ignore; we'll treat as not allowed below
      }

      const isAdmin = role === "admin";
      const ok = isAdmin && isAllowedStatus(status, legacyIsActive);

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
  // Once-per-tab session ping (deduped via sessionStorage to play nice with React 18 StrictMode)
  useEffect(() => {
    const KEY = "app-session-started";
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      // ignore storage errors (private mode, etc.)
    }
    recordSessionStart();
  }, []);

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
