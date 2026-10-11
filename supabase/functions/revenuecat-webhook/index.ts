// revenuecat-webhook - RevenueCat -> profiles.plan.
// RevenueCat sends `Authorization: <REVENUECAT_WEBHOOK_AUTH>` (set in the
// RevenueCat dashboard and as a function secret). Deployed with verify_jwt off.
// The app logs RevenueCat in with the Supabase user id, so app_user_id is that uuid.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle, type Profile, type Store } from "./handler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const store: Store = {
  async profiles(ids) {
    if (!ids.length) return [];
    const { data, error } = await admin.from("profiles").select("id, plan, founding").in("id", ids);
    if (error) throw error;
    return (data ?? []) as Profile[];
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

Deno.serve(async (req: Request) => {
  try {
    return await handle(req, { secret: Deno.env.get("REVENUECAT_WEBHOOK_AUTH") ?? "", store });
  } catch (e) {
    console.error("revenuecat-webhook failed", e);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }
});
