import { useEffect } from "react";
import { recordSessionStart } from "@/utils/telemetry";
import { Routes, Route, Navigate } from "react-router-dom";
import { message } from "antd";

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

/* ── Single source of truth for gating ── */
import ProtectedRoute from "@/components/ProtectedRoute";

/* ── Offline components ── */
import { OfflineBanner, offlineIndicatorStyles } from "@/components/OfflineIndicator";
import { onSyncNotification, type SyncNotification } from "@/core/offline";

/**
 * IMPORTANT:
 * - We removed the legacy RequireAdminActive guard that was calling signOut().
 * - Access control is handled exclusively by <ProtectedRoute /> now.
 * - If a user isn't allowed, ProtectedRoute will redirect to /sign-in without
 *   force-closing the session, preventing the login/logout loop.
 */

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

  // Listen for sync notifications and show as Ant Design messages
  useEffect(() => {
    const unsubscribe = onSyncNotification((notification: SyncNotification) => {
      switch (notification.type) {
        case 'success':
          message.success({
            content: notification.message,
            duration: 3,
          });
          break;
        case 'error':
          message.error({
            content: `${notification.message}${notification.description ? `: ${notification.description}` : ''}`,
            duration: 5,
          });
          break;
        case 'warning':
          message.warning({
            content: notification.message,
            duration: 4,
          });
          break;
        case 'info':
        default:
          message.info({
            content: notification.message,
            duration: 3,
          });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <>
      {/* Global offline banner */}
      <OfflineBanner />
      
      {/* Inject CSS for offline indicator animations */}
      <style>{offlineIndicatorStyles}</style>

      <Routes>
      {/* Default → sign-in */}
      <Route path="/" element={<Navigate to="/sign-in" replace />} />

      {/* Public auth routes */}
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected staff routes (wrapped with ProtectedRoute) */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sports"
        element={
          <ProtectedRoute>
            <Sports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sports/:sportName"
        element={
          <ProtectedRoute>
            <SportDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sports/:sportName/athletes/:athleteName"
        element={
          <ProtectedRoute>
            <AthleteDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-management"
        element={
          <ProtectedRoute>
            <UserManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manage-requests"
        element={
          <ProtectedRoute>
            <RequestManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />

      {/* Fallback → sign-in */}
      <Route path="*" element={<Navigate to="/sign-in" replace />} />
    </Routes>
    </>
  );
}
