// referral-rewards (deploy with verify_jwt on) - grant pending referral rewards (0025) as RevenueCat
// promotional `pull` time. Woken by referral_wake_rewards() (pg_net, service key)
// after a referral qualifies; the app may also call it with the user's JWT to
// collect that user's own pending rewards. Uses the REVENUECAT_SECRET_KEY
// function secret (v1 API), the same one sync-plan uses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type DueReward, handle } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const rcKey = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";

// Deployed with verify_jwt on, so the gateway has checked the signature before
// this runs; the service role's own JWT (referral_wake_rewards) carries role service_role.
function jwtRole(token: string): string | null {
  try {
    const part = token.split(".")[1] ?? "";
    return (JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

async function callerFor(token: string): Promise<string | null | undefined> {
  if (token === serviceKey || jwtRole(token) === "service_role") return null;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user || data.user.is_anonymous ? undefined : data.user.id;
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req, {
      callerFor,
      async due(user) {
        const { data, error } = await admin.rpc("referral_rewards_due", { p_user: user, p_limit: 50 });
        if (error) throw error;
        return (data ?? []) as DueReward[];
      },
      async grant(user, until) {
        const res = await fetch(
          `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user)}/entitlements/pull/promotional`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${rcKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ end_time_ms: until.getTime() }),
          },
        );
        if (!res.ok) throw new Error(`revenuecat ${res.status} ${(await res.text()).slice(0, 200)}`);
      },
      async result(id, status, until, err) {
        const { error } = await admin.rpc("referral_reward_result", {
          p_id: id,
          p_status: status,
          p_until: until?.toISOString() ?? null,
          p_error: err,
        });
        if (error) throw error;
      },
    });
  } catch (e) {
    console.error("referral-rewards failed", e);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }
});
