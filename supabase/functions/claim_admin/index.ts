import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // tighten to http://localhost:5173 if you prefer
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const isPupEmail = (email?: string | null) =>
  !!email && email.toLowerCase().endsWith("@iskolarngbayan.pup.edu.ph");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "No auth" }, 401);

    const supabase = createClient(url, serviceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user ?? null;
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // hard PUP check; optional RPC fallback if present
    if (!isPupEmail(user.email)) {
      try {
        const { data: ok } = await supabase.rpc("is_pup_webmail");
        if (!ok) return json({ error: "Only *@iskolarngbayan.pup.edu.ph may claim admin." }, 403);
      } catch {
        return json({ error: "Only *@iskolarngbayan.pup.edu.ph may claim admin." }, 403);
      }
    }

    // make sure profiles row exists (non-fatal if already there)
    await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email ?? null,
      role: "athlete",           // will be corrected by DB in Step 2
      status: "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    const invite = new URL(req.url).searchParams.get("invite");

    // zero-admin bootstrap (best-effort; skip if helper not present yet)
    let adminCount = 1;
    try {
      const { data: cnt } = await supabase.rpc("admin_count");
      if (typeof cnt === "number") adminCount = cnt;
    } catch { /* helper missing is fine */ }

    if (adminCount === 0) {
      const { error } = await supabase.rpc("escalate_to_admin", { target: user.id });
      if (error) return json({ error: "Bootstrap failed: missing SQL helpers" }, 500);

      await supabase.from("audit_logs").insert({
        actor_id: user.id, action: "bootstrap_admin", target_id: user.id,
        details: { note: "Zero-admin bootstrap" }, created_at: new Date().toISOString(),
      }).catch(() => {});
      return json({ ok: true, mode: "bootstrap" });
    }

    // invite or approved request
    let allowed = false;
    if (invite) {
      const nowIso = new Date().toISOString();
      const { data: inv } = await supabase.from("admin_invites").select("*").eq("token", invite).maybeSingle();
      if (inv && !inv.used_at && inv.expires_at > nowIso) {
        allowed = true;
        await supabase.from("admin_invites").update({ used_at: nowIso, used_by: user.id }).eq("token", invite);
        await supabase.from("audit_logs").insert({
          actor_id: user.id, action: "consume_invite", target_id: user.id,
          details: { invite }, created_at: nowIso,
        }).catch(() => {});
      }
    }
    if (!allowed) {
      const { data: reqRow } = await supabase
        .from("admin_role_requests")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .maybeSingle();
      if (reqRow) allowed = true;
    }
    if (!allowed) return json({ error: "Not approved or no valid invite" }, 403);

    const { error: esc } = await supabase.rpc("escalate_to_admin", { target: user.id });
    if (esc) return json({ error: "Elevation failed: missing SQL helpers" }, 500);

    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: "claim_admin", target_id: user.id,
      details: { via: invite ? "invite" : "request" }, created_at: new Date().toISOString(),
    }).catch(() => {});

    return json({ ok: true, mode: invite ? "invite" : "request" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
