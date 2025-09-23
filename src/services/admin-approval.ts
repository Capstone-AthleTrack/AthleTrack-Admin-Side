// src/services/admin-approval.ts
import type { PostgrestError } from "@supabase/supabase-js";
import supabase from "@/core/supabase";

/* ---------------- util ---------------- */
function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  const pe = e as Partial<PostgrestError> & { message?: string };
  return new Error(pe?.message || "Unknown error");
}

/* ---------------- types ---------------- */
type Role = "admin" | "coach" | "athlete" | "user" | null;
type Status = "pending" | "active" | "suspended" | "disabled" | null;

export type LiteProfile = {
  role: Role;
  status?: Status;
  is_active?: boolean | null; // legacy compat
};

/* -------------------------------------------------------------------------- */
/*  Ensure/refresh a profile row AFTER email has been verified.               */
/*  Replaces RPCs: ensure_profile_if_confirmed, bootstrap_profile             */
/* -------------------------------------------------------------------------- */
export async function postSignUpBootstrap(opts?: {
  fullName?: string | null;
  pupId?: string | null;
}) {
  const { data: au } = await supabase.auth.getUser();
  const user = au?.user;
  if (!user) throw new Error("Not signed in");

  // Only proceed once the email is confirmed (same behavior as old RPC)
  const isConfirmed = !!user.email_confirmed_at;
  if (!isConfirmed) return;

  // Minimal upsert to profiles (self row). Idempotent.
  const payload: Record<string, unknown> = {
    id: user.id,
    // Don't force role/status here; admin approval flow will set those.
    updated_at: new Date().toISOString(),
  };

  const fullName = (opts?.fullName ?? user.user_metadata?.full_name ?? "").trim();
  if (fullName) payload["full_name"] = fullName;

  const pupId = (opts?.pupId ?? "").trim();
  if (pupId) payload["pup_id"] = pupId;

  // Try upsert. If some optional columns don't exist in your schema,
  // PostgREST will error — catch and retry with only required columns.
  let upsertErr: PostgrestError | null = null;

  {
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    upsertErr = error as PostgrestError | null;
  }

  // If a column is missing (42703), retry with just id/updated_at/full_name
  if (upsertErr?.code === "42703") {
    const slim: Record<string, unknown> = {
      id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (fullName) slim["full_name"] = fullName;

    const { error } = await supabase.from("profiles").upsert(slim, { onConflict: "id" });
    if (error) throw asError(error);
  } else if (upsertErr) {
    throw asError(upsertErr);
  }
}

/* -------------------------------------------------------------------------- */
/*  File a pending admin-role request (idempotent).                           */
/*  Replaces RPC: request_admin_role                                          */
/* -------------------------------------------------------------------------- */
export async function submitAdminRequest(reason?: string | null) {
  const { data: au } = await supabase.auth.getUser();
  const user = au?.user;
  if (!user) throw new Error("Not signed in");

  // De-dupe: if the latest request is still pending, do nothing.
  const { data: existing, error: qErr } = await supabase
    .from("account_requests")
    .select("id,status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr) throw asError(qErr);
  if (existing && existing.status === "pending") return true;

  const { error } = await supabase.from("account_requests").insert({
    user_id: user.id,
    email: user.email ?? null,
    full_name: (user.user_metadata?.full_name ?? "").trim() || null,
    desired_role: "admin",
    device_name: (typeof navigator !== "undefined" ? navigator.userAgent : "web").slice(0, 128),
    status: "pending",
    reason: reason ?? null,
  });

  if (error) throw asError(error);
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Compact profile for gating (role + status).                               */
/*  Replaces RPC: get_my_profile_lite                                         */
/* -------------------------------------------------------------------------- */
export async function getMyProfile(): Promise<LiteProfile | null> {
  const { data: au } = await supabase.auth.getUser();
  const user = au?.user;
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("profiles")
    .select("role,status,is_active")
    .eq("id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw asError(error);
  if (!data) return null;
  return data as LiteProfile;
}

/* -------------------------------------------------------------------------- */
/*  Boolean check for admin                                                   */
/*  Replaces RPC: is_admin                                                    */
/* -------------------------------------------------------------------------- */
export async function isAdmin(): Promise<boolean> {
  const prof = await getMyProfile();
  if (!prof) return false;

  const role = (prof.role ?? "user") as Role;
  const status = (prof.status ?? ((prof.is_active ? "active" : "pending") as Status)) as Status;

  return role === "admin" && status === "active";
}
