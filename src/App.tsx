import { Routes, Route, Navigate } from "react-router-dom";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Sports from "./components/Sports"; 
import SportDetail from "./pages/SportsDetail"; 
import AthleteDetail from "./pages/AthleteDetail";
import UserManagement from "./pages/UserManagement";
import RequestManagement from "./pages/RequestManagement";
import Settings from "./pages/Settings"; 

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/sign-in" replace />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/sports" element={<Sports />} />
      <Route path="/sports/:sportName" element={<SportDetail />} />
      <Route path="/sports/:sportName/athletes/:athleteName" element={<AthleteDetail />} />
      <Route path="/user-management" element={<UserManagement />} />
      <Route path="/manage-requests" element={<RequestManagement />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}