// supabase/functions/deny_account/index.ts
// Deny a pending account request and delete the auth user.
// Body: { id: string, reason: string }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(res: unknown, init: number | ResponseInit = 200) {
  const status = typeof init === "number" ? init : (init as ResponseInit).status ?? 200;
  const headers = new Headers(typeof init === "number" ? undefined : (init as ResponseInit).headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(res), { status, headers });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type" },
    });
  }
  const corsHeaders = { "access-control-allow-origin": "*" };

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, { status: 401, headers: corsHeaders });

    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: me, error: meErr } = await supabaseUser.auth.getUser();
    if (meErr || !me?.user) return json({ error: "Invalid or expired session" }, { status: 401, headers: corsHeaders });

    const { data: isAdmin, error: isAdminErr } = await supabaseUser.rpc("is_admin");
    if (isAdminErr) return json({ error: "is_admin check failed", detail: isAdminErr.message }, { status: 500, headers: corsHeaders });
    if (!isAdmin) return json({ error: "Forbidden: admin only" }, { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    const reason = String(body.reason ?? "").trim();
    if (!id) return json({ error: "id is required" }, { status: 400, headers: corsHeaders });
    if (!reason) return json({ error: "reason is required" }, { status: 400, headers: corsHeaders });

    // Load request
    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("account_requests")
      .select("id,user_id,email,status")
      .eq("id", id)
      .single();

    if (reqErr) return json({ error: "Request not found", detail: reqErr.message }, { status: 404, headers: corsHeaders });
    if (!reqRow) return json({ error: "Request not found" }, { status: 404, headers: corsHeaders });
    if (String(reqRow.status).toLowerCase() !== "pending") {
      return json({ error: "Request is not pending" }, { status: 409, headers: corsHeaders });
    }

    const userId = reqRow.user_id as string;

    // Mark denied first (so reason is recorded)
    const { error: arErr, data: arData } = await supabaseAdmin
      .from("account_requests")
      .update({ status: "denied", reason, decided_by: me.user.id, decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .single();

    if (arErr) return json({ error: "Failed updating request", detail: arErr.message }, { status: 500, headers: corsHeaders });

    // Delete auth user (this cascades to profiles; account_requests may be deleted too due to FK)
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) {
      // Best-effort rollback: set status back to pending if deletion failed
      await supabaseAdmin.from("account_requests").update({ status: "pending", reason: "" }).eq("id", id);
      return json({ error: "Failed to delete user", detail: delErr.message }, { status: 500, headers: corsHeaders });
    }

    // Audit (best-effort) — no `any`
    try {
      await supabaseAdmin.from("audit_logs").insert({
        action: "deny_account",
        actor_id: me.user.id,
        target_id: userId,
        details: { request_id: id, reason },
        created_at: new Date().toISOString(),
      });
    } catch {
      /* noop */
    }

    return json({ ok: true, request: arData }, { status: 200, headers: corsHeaders });
  } catch (e) {
    const detail = (e as Error)?.message ?? String(e);
    return json({ error: "Unexpected error", detail }, { status: 500, headers: { "access-control-allow-origin": "*" } });
  }
});
