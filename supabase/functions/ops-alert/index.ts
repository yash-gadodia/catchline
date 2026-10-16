// ops-alert - pushes ops incidents to the owner's phone.
// Called by ops_health_check() (0008, pg_cron every 5 min) through pg_net with
// the service key from Vault. Deployed with verify_jwt on: the gateway checks
// the JWT, the handler requires role service_role. Recipients are the profile
// ids in the OPS_ALERT_USER_IDS function secret (comma-separated); each one's
// profiles.push_token gets an Expo push.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle, jwtRole, parseIds, type Push } from "./handler.ts";

const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } });

async function pushTokens(ids: string[]): Promise<string[]> {
  const { data, error } = await admin.from("profiles").select("push_token").in("id", ids);
  if (error) throw error;
  return (data ?? []).map((r: { push_token: string | null }) => r.push_token).filter((t): t is string => !!t);
}

async function send(messages: Push[]): Promise<void> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`expo push ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req, {
      isServiceRole: (h) => jwtRole(h) === "service_role" || h === `Bearer ${serviceKey}`,
      adminIds: parseIds(Deno.env.get("OPS_ALERT_USER_IDS")),
      pushTokens,
      send,
    });
  } catch (e) {
    console.error("ops-alert failed", e);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }
});
