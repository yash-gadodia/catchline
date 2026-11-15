// Grants pending referral rewards as RevenueCat promotional time on `pull`.
// Time stacks from the later of now and what the user already banked, and never
// reaches past 12 months from now (the bank cap); a reward with no room left is
// 'capped'. A RevenueCat error marks the row 'failed' so the next run retries it
// (referral_rewards_due stops after 5 attempts).

export const BANK_CAP_DAYS = 365;
const DAY_MS = 86_400_000;

export type DueReward = {
  id: string;
  user_id: string;
  reason: string;
  days: number;
  attempts: number;
  banked_until: string | null;
};

export type Plan = { status: "granted"; until: Date } | { status: "capped" };

export function planReward(days: number, bankedUntil: Date | null, now: Date): Plan {
  const cap = now.getTime() + BANK_CAP_DAYS * DAY_MS;
  const base = Math.max(now.getTime(), bankedUntil?.getTime() ?? 0);
  if (base >= cap) return { status: "capped" };
  return { status: "granted", until: new Date(Math.min(base + days * DAY_MS, cap)) };
}

export type Deps = {
  /** null: the service role (every user); a user id: only that user's rewards; undefined: refuse. */
  callerFor(token: string): Promise<string | null | undefined>;
  due(user: string | null): Promise<DueReward[]>;
  grant(user: string, until: Date): Promise<void>;
  result(id: string, status: "granted" | "capped" | "failed", until: Date | null, error: string | null): Promise<void>;
  now?: () => Date;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const caller = token ? await deps.callerFor(token) : undefined;
  if (caller === undefined) return json({ error: "unauthorized" }, 401);

  const now = (deps.now ?? (() => new Date()))();
  const banked = new Map<string, Date | null>();
  const counts = { granted: 0, capped: 0, failed: 0 };

  for (const r of await deps.due(caller)) {
    if (!banked.has(r.user_id)) banked.set(r.user_id, r.banked_until ? new Date(r.banked_until) : null);
    const plan = planReward(r.days, banked.get(r.user_id) ?? null, now);
    if (plan.status === "capped") {
      await deps.result(r.id, "capped", null, null);
      counts.capped++;
      continue;
    }
    try {
      await deps.grant(r.user_id, plan.until);
      await deps.result(r.id, "granted", plan.until, null);
      banked.set(r.user_id, plan.until);
      counts.granted++;
    } catch (e) {
      await deps.result(r.id, "failed", null, String(e instanceof Error ? e.message : e).slice(0, 500));
      counts.failed++;
    }
  }
  return json(counts);
}
