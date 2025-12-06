// src/utils/telemetry.ts
import supabase from "@/core/supabase";
import { getNetworkStatus, queueAdd } from "@/core/offline";

/**
 * Record a login event using the RPC function
 * This logs to login_events/telemetry_logins tables
 */
export async function recordLogin(_provider?: string) {
  const u = (await supabase.auth.getUser()).data.user;
  if (!u) return;
  
  if (getNetworkStatus()) {
    try {
      // Use the RPC function that inserts into the correct table
      await supabase.rpc("rpc_log_login");
    } catch (err) {
      console.warn("[telemetry] Failed to log login:", err);
      // Queue for later if RPC fails
      await queueAdd("telemetry:login", { userId: u.id });
    }
  } else {
    // Queue for background sync when offline
    await queueAdd("telemetry:login", { userId: u.id });
  }
}

let sessionSent = false;
/**
 * Record a session start using the RPC function
 * This logs to telemetry_sessions table
 */
export async function recordSessionStart(_page: string = window.location.pathname) {
  if (sessionSent) return;
  sessionSent = true;
  
  const u = (await supabase.auth.getUser()).data.user;
  if (!u) return; // Only log for authenticated users
  
  if (getNetworkStatus()) {
    try {
      // Use the RPC function that inserts into the correct table
      // Platform parameter: 'web', 'ios', 'android', etc.
      await supabase.rpc("rpc_log_session", { _platform: "web" });
    } catch (err) {
      console.warn("[telemetry] Failed to log session:", err);
      // Queue for later if RPC fails
      await queueAdd("telemetry:session", { userId: u.id, platform: "web" });
    }
  } else {
    // Queue for background sync when offline
    await queueAdd("telemetry:session", { userId: u.id, platform: "web" });
  }
}
