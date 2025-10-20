// src/services/authSecurity.tsx
import supabase from "@/core/supabase";

/** Optional scope supported by newer Supabase JS versions */
type SignOutScope = "others" | "global" | "current";

/** Narrow type for a possibly scoped signOut method in newer SDKs */
type MaybeScopedSignOut = (opts?: { scope?: SignOutScope }) => Promise<unknown>;

/** Gmail-only helper */
const isGmail = (e?: string | null) =>
  !!e && e.toLowerCase().trim().endsWith("@gmail.com");

/**
 * Re-authenticates with the current password, then updates to the new password.
 */
export async function changePassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const { currentPassword, newPassword } = params;

  // 1) Get current user/email
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message || "Unable to read current user.");
  const email = userRes?.user?.email;
  if (!email) throw new Error("No signed-in user.");

  // Gmail-only guard (client-side UX; DB also enforces)
  if (!isGmail(email)) {
    throw new Error("Only @gmail.com accounts are allowed.");
  }

  // 2) Re-authenticate with current password
  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (reauthErr) {
    const msg = reauthErr.message ?? "";
    if (msg.toLowerCase().includes("invalid login")) {
      throw new Error("Current password is incorrect.");
    }
    throw new Error(msg || "Re-authentication failed.");
  }

  // 3) Update password
  const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updErr) throw new Error(updErr.message || "Failed to change password.");

  // 4) Optional: revoke other sessions if the SDK supports scoped signOut.
  try {
    const signOut = (supabase.auth as unknown as { signOut?: MaybeScopedSignOut }).signOut;
    if (typeof signOut === "function") {
      await signOut({ scope: "others" });
    }
  } catch {
    // Silently ignore if not supported.
  }
}
