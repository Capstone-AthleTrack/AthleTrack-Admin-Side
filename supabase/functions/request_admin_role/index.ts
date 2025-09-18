import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth" }, 401);

    const supabase = createClient(url, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: isPup } = await supabase.rpc("is_pup_webmail");
    if (!isPup) return json({ error: "Only PUP webmail can request admin" }, 403);

    // ensure profile exists
    await supabase.from("profiles").upsert(
      { id: user.id, email: user.email ?? null, role: "user", status: "pending" },
      { onConflict: "id" },
    );

    // reuse pending
    const { data: existing } = await supabase
      .from("admin_role_requests")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) return json({ ok: true, request: existing });

    const { data, error } = await supabase
      .from("admin_role_requests")
      .insert({ user_id: user.id, source: "self" })
      .select()
      .single();

    if (error) throw error;

    await supabase.from("audit_logs").insert({
      actor_id: user.id, action: "request_admin", target_id: user.id, details: {},
    });

    return json({ ok: true, request: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
