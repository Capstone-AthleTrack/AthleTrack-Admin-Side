import { Routes, Route, Navigate } from "react-router-dom";

/* ── Public pages ── */
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";

/* ── Staff (protected) pages ── */
import Dashboard from "./pages/Dashboard";
import Sports from "./components/Sports";
import SportDetail from "./pages/SportsDetail";
import AthleteDetail from "./pages/AthleteDetail";
import UserManagement from "./pages/UserManagement";
import RequestManagement from "./pages/RequestManagement";
import Settings from "./pages/Settings";

/* ── Guard ── */
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      {/* Default → dashboard (guard decides sign-in vs allow) */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public auth routes */}
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected staff routes */}
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

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
