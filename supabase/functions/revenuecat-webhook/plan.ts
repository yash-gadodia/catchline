// Pure mapping from a RevenueCat webhook event to a plan change. No I/O, so
// plan_test.ts covers it exactly. Ids match docs/catchline/PRODUCTS.md.

export type Plan = "free" | "hook" | "pull" | "platform" | "founding";

export const RANK: Record<Plan, number> = { free: 0, hook: 1, pull: 2, founding: 3, platform: 4 };

export type RcEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  new_product_id?: string;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  transferred_from?: string[];
  transferred_to?: string[];
  event_timestamp_ms?: number;
};

const ENTITLEMENT_PLAN: Record<string, Plan> = {
  hook: "hook",
  pull: "pull",
  platform: "platform",
  founding: "founding",
};

// Store ids: iOS `catchline_pull_annual_trial7`, Play `catchline_pull:annual-trial7`.
export function planFromProduct(productId: string | undefined): Plan {
  if (!productId) return "free";
  if (productId.startsWith("catchline_founding_lifetime")) return "founding";
  if (productId.startsWith("catchline_platform")) return "platform";
  if (productId.startsWith("catchline_pull")) return "pull";
  if (productId.startsWith("catchline_hook")) return "hook";
  return "free";
}

export function highest(plans: Plan[]): Plan {
  return plans.reduce<Plan>((best, p) => (RANK[p] > RANK[best] ? p : best), "free");
}

// Highest of the event's entitlements and the product it names.
export function planFromEvent(event: RcEvent, productId = event.product_id): Plan {
  const ids = [...(event.entitlement_ids ?? []), ...(event.entitlement_id ? [event.entitlement_id] : [])];
  return highest([planFromProduct(productId), ...ids.map((id) => ENTITLEMENT_PLAN[id] ?? "free")]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Supabase user ids among the event's ids, in priority order. RevenueCat
// anonymous ids ($RCAnonymousID:...) never match.
export function candidateUserIds(event: RcEvent): string[] {
  const ids = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  return [...new Set(ids.filter((id): id is string => !!id && UUID.test(id)).map((id) => id.toLowerCase()))];
}

export function uuidsIn(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter((id) => UUID.test(id)).map((id) => id.toLowerCase()))];
}

export const GRANT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
]);

export type Change = { plan: Plan; founding: boolean | null } | null;

// What to write for one user, given their current plan. null = no change.
// PRODUCT_CHANGE only applies upgrades (immediate on iOS); a downgrade takes
// effect at the next RENEWAL, which carries the new product.
// EXPIRATION only drops the plan if the expiring product is at least the
// current tier (an old lower tier expiring after an upgrade changes nothing);
// the database floors a founder at 'founding'.
export function changeFor(event: RcEvent, current: Plan): Change {
  const type = event.type ?? "";
  if (GRANT_TYPES.has(type)) {
    const plan = planFromEvent(event);
    if (plan === "free") return null;
    return { plan, founding: plan === "founding" || hasFounding(event) ? true : null };
  }
  if (type === "PRODUCT_CHANGE") {
    const plan = planFromProduct(event.new_product_id);
    if (plan === "free" || RANK[plan] <= RANK[current]) return null;
    return { plan, founding: plan === "founding" ? true : null };
  }
  if (type === "EXPIRATION") {
    const expired = planFromEvent(event);
    if (expired === "founding" || RANK[expired] < RANK[current]) return null;
    return { plan: "free", founding: null };
  }
  return null;
}

function hasFounding(event: RcEvent): boolean {
  return (event.entitlement_ids ?? []).includes("founding") || event.entitlement_id === "founding";
}
