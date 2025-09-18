// reject_admin: admin-only rejection
// POST body: { request_id: string, reason?: string }
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

    const { request_id, reason } = await req.json();

    await supabase.from("admin_role_requests").update({
      status: "rejected", reason, decided_by: user.id, decided_at: new Date().toISOString()
    }).eq("id", request_id);

    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: "reject_admin", details: { request_id, reason }
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
});
