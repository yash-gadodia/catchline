// delete-account - App-Store-grade account deletion.
// delete_my_account() (RPC) erases the caller's lifts, analyses, cues, coach links
// and consents (storage is swept by purge_storage), but a SQL RPC can't remove the
// Supabase Auth record. This function does
// both: it runs the RPC as the caller, then uses the service_role admin API to
// delete the auth user. The client calls it via supabase.functions.invoke('delete-account').
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_auth" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // User-scoped client (forwards the caller's JWT) — identifies them and runs the
  // RPC as them so its auth.uid() resolves correctly. The anon key alone is a valid
  // JWT, so getUser() is what proves a REAL signed-in user is calling.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  // 1) erase app data (SECURITY DEFINER RPC, scoped by auth.uid())
  const { error: rpcErr } = await userClient.rpc("delete_my_account");
  if (rpcErr) return json({ error: "data_delete_failed", detail: rpcErr.message }, 500);

  // 2) erase the Supabase Auth record (admin only)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return json({ error: "auth_delete_failed", detail: delErr.message }, 500);

  return json({ success: true });
});
