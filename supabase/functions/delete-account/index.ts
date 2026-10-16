// delete-account - App-Store-grade account deletion.
// delete_my_account() (RPC) erases the caller's lifts, analyses, cues, coach links
// and consents (storage is swept by purge_storage), but a SQL RPC can't remove the
// Supabase Auth record. This function runs the RPC as the caller, revokes the
// stored Sign in with Apple token (apple_tokens, 0009; GATE: skipped until the
// APPLE_SIWA_* secrets are set), then uses the service_role admin API to delete
// the auth user. The client calls it via supabase.functions.invoke('delete-account').
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { revokeToken, siwaConfig } from "../_shared/apple.ts";
import { handle } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cfg = siwaConfig((n) => Deno.env.get(n));

// User-scoped client (forwards the caller's JWT): getUser() proves a REAL
// signed-in user is calling (the anon key alone is a valid JWT), and the RPC
// runs as them so its auth.uid() resolves.
const userClient = (authHeader: string) =>
  createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  try {
    return await handle(req, {
      async userFor(authHeader) {
        const { data, error } = await userClient(authHeader).auth.getUser();
        return error || !data.user ? null : data.user.id;
      },
      async deleteData(authHeader) {
        const { error } = await userClient(authHeader).rpc("delete_my_account");
        return error ? error.message : null;
      },
      appleConfigured: cfg !== null,
      async appleToken(userId) {
        const { data, error } = await admin.from("apple_tokens").select("refresh_token").eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        return (data as { refresh_token: string } | null)?.refresh_token ?? null;
      },
      revokeApple: (token) => revokeToken(cfg!, token),
      async deleteAuthUser(userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        return error ? error.message : null;
      },
    });
  } catch (e) {
    console.error("delete-account failed", e);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }
});
