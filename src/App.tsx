import { useEffect, lazy, Suspense } from "react";
import { recordSessionStart } from "@/utils/telemetry";
import { Routes, Route, Navigate } from "react-router-dom";
import { message, Spin } from "antd";

/* ── Lazy-loaded Public pages (code splitting) ── */
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));

/* ── Lazy-loaded Staff (protected) pages (code splitting) ── */
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Sports = lazy(() => import("./components/Sports"));
const SportDetail = lazy(() => import("./pages/SportsDetail"));
const AthleteDetail = lazy(() => import("./pages/AthleteDetail"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const RequestManagement = lazy(() => import("./pages/RequestManagement"));
const Settings = lazy(() => import("./pages/Settings"));

/* ── Single source of truth for gating ── */
import ProtectedRoute from "@/components/ProtectedRoute";

/* ── Offline components ── */
import { OfflineBanner, offlineIndicatorStyles } from "@/components/OfflineIndicator";
import { onSyncNotification, type SyncNotification } from "@/core/offline";

/* ── Loading fallback for lazy-loaded components ── */
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-[#fff8cc]">
    <Spin size="large" tip="Loading..." />
  </div>
);

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

      {/* Suspense wrapper for lazy-loaded routes */}
      <Suspense fallback={<PageLoader />}>
        <Routes>
      {/* Default → sign-in */}
      <Route path="/" element={<Navigate to="/sign-in" replace />} />

      {/* Public auth routes */}
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/update-password" element={<UpdatePassword />} />

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
      </Suspense>
    </>
  );
}
