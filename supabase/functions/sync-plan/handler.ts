import { type Plan, planFromSubscriber, RANK, type RcSubscriber, syncEventId } from "./plan.ts";

export type Profile = { id: string; plan: Plan; founding: boolean };

export interface Store {
  profile(id: string): Promise<Profile | null>;
  applyPlan(args: {
    user: string;
    plan: Plan;
    founding: boolean | null;
    eventId: string;
    eventType: string;
    eventAt: string;
  }): Promise<string>;
}

export type Deps = {
  /** The Supabase user id for the bearer token, or null when it is not a signed-in user. */
  userFor(token: string): Promise<string | null>;
  fetchSubscriber(userId: string): Promise<RcSubscriber | null>;
  store: Store;
  now?: () => Date;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// The caller is the JWT's user, never a body id. The sync never downgrades: an
// expiry is the webhook's job (EXPIRATION), and RevenueCat's live state is at
// least as fresh as any event, so a higher plan here is always safe to apply.
// event_at is now, so a sync is never 'stale' against a webhook event that was
// never applied, and a later real event still lands on top of it.
export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const user = token ? await deps.userFor(token) : null;
  if (!user) return json({ error: "unauthorized" }, 401);

  const profile = await deps.store.profile(user);
  if (!profile) return json({ error: "no_profile" }, 404);

  const now = (deps.now ?? (() => new Date()))();
  const computed = planFromSubscriber(await deps.fetchSubscriber(user), now);
  const founding = profile.founding || computed.founding;
  const plan = founding && RANK[computed.plan] < RANK.founding ? "founding" : computed.plan;

  if (RANK[plan] < RANK[profile.plan]) {
    return json({ plan: profile.plan, founding: profile.founding, result: "kept" });
  }
  if (plan === profile.plan && founding === profile.founding) {
    return json({ plan, founding, result: "unchanged" });
  }
  const result = await deps.store.applyPlan({
    user,
    plan: computed.plan,
    founding: computed.founding ? true : null,
    eventId: syncEventId(user, computed.latestAt),
    eventType: "SYNC",
    eventAt: now.toISOString(),
  });
  return json({ plan, founding, result });
}
