// Pure mapping from a RevenueCat v1 subscriber (GET /v1/subscribers/{id}) to
// the plan the server should hold. Same entitlement ranking as
// revenuecat-webhook/plan.ts; founding is permanent there too.

export type Plan = "free" | "hook" | "pull" | "platform" | "founding";

export const RANK: Record<Plan, number> = { free: 0, hook: 1, pull: 2, founding: 3, platform: 4 };

const ENTITLEMENT_PLAN: Record<string, Plan> = {
  hook: "hook",
  pull: "pull",
  platform: "platform",
  founding: "founding",
};

export type RcEntitlement = {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string;
  purchase_date?: string;
};

export type RcSubscriber = {
  entitlements?: Record<string, RcEntitlement>;
};

export type Computed = { plan: Plan; founding: boolean; latestAt: string | null };

export function highest(plans: Plan[]): Plan {
  return plans.reduce<Plan>((best, p) => (RANK[p] > RANK[best] ? p : best), "free");
}

function active(ent: RcEntitlement, now: Date): boolean {
  const until = ent.grace_period_expires_date ?? ent.expires_date;
  return until === null || until === undefined || new Date(until).getTime() > now.getTime();
}

// Plan from the entitlements active at `now`; founding from ever having held
// the founding entitlement (a lifetime purchase, so it never expires anyway).
// latestAt is the newest purchase or expiry date across all entitlements, so
// the sync event id changes whenever the subscriber state does.
export function planFromSubscriber(sub: RcSubscriber | null, now: Date): Computed {
  const entitlements = Object.entries(sub?.entitlements ?? {});
  const plans = entitlements.filter(([, e]) => active(e, now)).map(([id]) => ENTITLEMENT_PLAN[id] ?? "free");
  const founding = entitlements.some(([id]) => id === "founding");
  const dates = entitlements
    .flatMap(([, e]) => [e.purchase_date, e.expires_date])
    .filter((d): d is string => !!d)
    .sort();
  return { plan: highest(plans), founding, latestAt: dates.at(-1) ?? null };
}

export function syncEventId(user: string, latestAt: string | null): string {
  return `sync:${user}:${latestAt ?? "none"}`;
}
