// approve_admin: admin-only approval
// POST body: { user_id: string, request_id?: string }
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("No auth", { status: 401 });

    const supabase = createClient(url, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) return new Response("Forbidden", { status: 403 });

    const { user_id, request_id } = await req.json();

    // hard block at DB layer too
    const { data: okPup } = await supabase.rpc("is_pup_webmail_for", { target: user_id });
    if (!okPup) return new Response("Target must be PUP webmail", { status: 400 });

    if (request_id) {
      await supabase.from("admin_role_requests").update({
        status: "approved", decided_by: user.id, decided_at: new Date().toISOString()
      }).eq("id", request_id);
    }

    const { error: escErr } = await supabase.rpc("escalate_to_admin", { target: user_id });
    if (escErr) throw escErr;

    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: "approve_admin", target_id: user_id, details: { request_id }
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
});
