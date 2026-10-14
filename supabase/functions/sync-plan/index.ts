// sync-plan - pull the caller's plan from RevenueCat into profiles.plan.
// For a purchase or restore whose webhook was missed or is slow. Deployed with
// verify_jwt on; the user is the JWT's, fetched from RevenueCat with the
// REVENUECAT_SECRET_KEY function secret (v1 API), written through apply_plan.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle, type Profile, type Store } from "./handler.ts";
import type { RcSubscriber } from "./plan.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const rcKey = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";

const store: Store = {
  async profile(id) {
    const { data, error } = await admin.from("profiles").select("id, plan, founding").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as Profile | null) ?? null;
  },
  async applyPlan({ user, plan, founding, eventId, eventType, eventAt }) {
    const { data, error } = await admin.rpc("apply_plan", {
      p_user: user,
      p_plan: plan,
      p_founding: founding,
      p_event_id: eventId,
      p_event_type: eventType,
      p_event_at: eventAt,
    });
    if (error) throw error;
    return data as string;
  },
};

async function userFor(token: string): Promise<string | null> {
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

async function fetchSubscriber(userId: string): Promise<RcSubscriber | null> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${rcKey}` },
  });
  if (!res.ok) throw new Error(`revenuecat ${res.status}`);
  return ((await res.json()) as { subscriber?: RcSubscriber }).subscriber ?? null;
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req, { userFor, fetchSubscriber, store });
  } catch (e) {
    console.error("sync-plan failed", e);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }
});
