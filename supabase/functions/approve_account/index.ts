// supabase/functions/approve_account/index.ts
// Approve a pending account request.
// Body: { id: string, finalRole: 'athlete'|'coach'|'admin', reason: string, teamId?: string }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type FinalRole = "athlete" | "coach" | "admin";

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
const DOMAIN = "@iskolarngbayan.pup.edu.ph";

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

    // User-scoped client (to verify caller is admin via RLS)
    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client (service role) for privileged mutations and auth deletion
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: me, error: meErr } = await supabaseUser.auth.getUser();
    if (meErr || !me?.user) return json({ error: "Invalid or expired session" }, { status: 401, headers: corsHeaders });

    // Enforce admin caller
    const { data: isAdmin, error: isAdminErr } = await supabaseUser.rpc("is_admin");
    if (isAdminErr) return json({ error: "is_admin check failed", detail: isAdminErr.message }, { status: 500, headers: corsHeaders });
    if (!isAdmin) return json({ error: "Forbidden: admin only" }, { status: 403, headers: corsHeaders });

    // Parse body
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    const finalRole = String(body.finalRole ?? "").toLowerCase() as FinalRole;
    const reason = String(body.reason ?? "").trim();
    const teamId = body.teamId ? String(body.teamId) : undefined;

    if (!id) return json({ error: "id is required" }, { status: 400, headers: corsHeaders });
    if (!["athlete", "coach", "admin"].includes(finalRole)) {
      return json({ error: "finalRole must be athlete|coach|admin" }, { status: 400, headers: corsHeaders });
    }
    if (!reason) return json({ error: "reason is required" }, { status: 400, headers: corsHeaders });

    // Load request with service client
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

    // Domain enforcement
    const email = String(reqRow.email ?? "").toLowerCase();
    const isPup = email.endsWith(DOMAIN);
    if (!isPup) {
      return json({ error: "Approval blocked: email must be @iskolarngbayan.pup.edu.ph" }, { status: 403, headers: corsHeaders });
    }

    const userId = reqRow.user_id as string;

    // 1) Set profile role + status=active
    const { error: profErr } = await supabaseAdmin.from("profiles").update({ role: finalRole, status: "active" }).eq("id", userId);
    if (profErr) return json({ error: "Failed updating profile", detail: profErr.message }, { status: 500, headers: corsHeaders });

    // (Optional) add to team_members if provided — ignore if table missing
    if (teamId) {
      try {
        await supabaseAdmin.from("team_members").upsert(
          [{ team_id: teamId, user_id: userId, role: finalRole, created_at: new Date().toISOString() }],
          { onConflict: "team_id,user_id" },
        );
      } catch {
        /* noop */
      }
    }

    // 2) Mark request approved
    const { error: arErr, data: arData } = await supabaseAdmin
      .from("account_requests")
      .update({ status: "approved", reason, decided_by: me.user.id, decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .single();

    if (arErr) return json({ error: "Failed updating request", detail: arErr.message }, { status: 500, headers: corsHeaders });

    // 3) Audit log (best-effort) — removed `as any` to satisfy ESLint
    try {
      await supabaseAdmin.from("audit_logs").insert({
        action: "approve_account",
        actor_id: me.user.id,
        target_id: userId,
        details: { request_id: id, final_role: finalRole, email },
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
