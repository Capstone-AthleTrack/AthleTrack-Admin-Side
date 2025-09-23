// src/utils/telemetry.ts
import supabase from "@/core/supabase";

export async function recordLogin(provider?: string) {
  const u = (await supabase.auth.getUser()).data.user;
  if (!u) return;
  await supabase.from("auth_events").insert({
    user_id: u.id,
    event: "login",
    device: "web",
    platform: "react",
    provider: provider ?? "password",
  });
}

let sent = false;
export async function recordSessionStart(page: string = window.location.pathname) {
  if (sent) return;
  sent = true;
  const u = (await supabase.auth.getUser()).data.user;
  await supabase.from("app_sessions").insert({
    user_id: u?.id ?? null,
    device: "web",
    platform: "react",
    page,
  });
}
