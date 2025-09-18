/* Admin approval glue — NO UI CHANGES */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../core/supabase"; // ← use your singleton

const supabase: SupabaseClient = getSupabase();

/* ----------------------------- types ----------------------------- */
export type AdminRequestRow = {
  id: string;
  user_id: string;
  source: string | null;
  invite_token: string | null;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
};

export type ProfileRow = {
  id: string;
  email: string | null;
  role: "admin" | "coach" | "athlete";
  status: "pending" | "active" | "suspended" | "disabled";
};

/* -------------------------- edge helper -------------------------- */
async function callEdge<T = unknown>(name: string, init?: RequestInit): Promise<T> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("Not authenticated");

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    ...init,
    headers,
  });
  if (!res.ok) throw new Error(await res.text());

  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

/* --------------------------- public API -------------------------- */
export async function postSignUpBootstrap() {
  const invite = new URLSearchParams(window.location.search).get("invite");
  const path = invite ? `claim_admin?invite=${encodeURIComponent(invite)}` : "claim_admin";
  return callEdge(path, { method: "POST" });
}

export async function submitAdminRequest() {
  return callEdge("request_admin_role", { method: "POST" });
}

export async function issueAdminInvite(expiresInDays = 7) {
  return callEdge("issue_admin_invite", {
    method: "POST",
    body: JSON.stringify({ expiresInDays }),
  });
}

export async function approveAdmin(userId: string, requestId?: string) {
  return callEdge("approve_admin", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, request_id: requestId }),
  });
}

export async function rejectAdmin(requestId: string, reason?: string) {
  return callEdge("reject_admin", {
    method: "POST",
    body: JSON.stringify({ request_id: requestId, reason }),
  });
}

export async function listAdminRequests(): Promise<AdminRequestRow[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not authenticated");

  const adminQuery = await supabase
    .from("admin_role_requests")
    .select("id,user_id,source,invite_token,status,reason,decided_by,created_at,decided_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .returns<AdminRequestRow[]>();

  if (adminQuery.error) {
    const ownQuery = await supabase
      .from("admin_role_requests")
      .select("id,user_id,source,invite_token,status,reason,decided_by,created_at,decided_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<AdminRequestRow[]>();
    return ownQuery.data ?? [];
  }

  return adminQuery.data ?? [];
}

export async function getMyProfile(): Promise<ProfileRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id,email,role,status")
    .eq("id", user.id)
    .maybeSingle()
    .returns<ProfileRow>();

  return data ?? null;
}
