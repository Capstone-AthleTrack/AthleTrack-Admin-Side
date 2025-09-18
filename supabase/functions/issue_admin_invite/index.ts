// issue_admin_invite: admin-only create a single-use invite
// POST body: {expiresInDays?: number}
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

    const { expiresInDays = 7 } = (await req.json().catch(() => ({}))) as { expiresInDays?: number };
    const token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + expiresInDays * 86400000).toISOString();

    const { data, error } = await supabase.from("admin_invites").insert({
      token, issued_by: user.id, expires_at
    }).select().single();

    if (error) throw error;

    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: "issue_invite", details: { token, expires_at }
    });

    return new Response(JSON.stringify({ ok: true, invite: data }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
});
