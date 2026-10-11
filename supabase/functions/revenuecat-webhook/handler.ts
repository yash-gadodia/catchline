import { candidateUserIds, changeFor, highest, type Plan, planFromEvent, type RcEvent, uuidsIn } from "./plan.ts";

export type Profile = { id: string; plan: Plan; founding: boolean };

export interface Store {
  profiles(ids: string[]): Promise<Profile[]>;
  applyPlan(args: {
    user: string;
    plan: Plan;
    founding: boolean | null;
    eventId: string;
    eventType: string;
    eventAt: string;
  }): Promise<string>;
}

export type Deps = { secret: string; store: Store; log?: (msg: string) => void };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Constant-time: compare SHA-256 digests so length leaks nothing either.
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const log = deps.log ?? console.log;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await sameSecret(req.headers.get("Authorization") ?? "", deps.secret))) {
    return json({ error: "unauthorized" }, 401);
  }

  let event: RcEvent;
  try {
    event = ((await req.json()) as { event?: RcEvent }).event ?? {};
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const type = event.type ?? "";
  if (!event.id || !type) return json({ error: "bad_event" }, 400);
  if (type === "TEST") return json({ ok: true, ignored: "test" });

  const eventAt = new Date(event.event_timestamp_ms ?? Date.now()).toISOString();

  if (type === "TRANSFER") return json(await transfer(event, eventAt, deps.store, log));

  const ids = candidateUserIds(event);
  const found = ids.length ? await deps.store.profiles(ids) : [];
  const profile = ids.map((id) => found.find((p) => p.id === id)).find((p) => p);
  if (!profile) {
    log(`revenuecat-webhook: ${type} ${event.id} has no matching profile (app_user_id ${event.app_user_id})`);
    return json({ ok: true, ignored: "unknown_user" });
  }

  const change = changeFor(event, profile.plan);
  if (!change) return json({ ok: true, ignored: "no_change" });
  const result = await deps.store.applyPlan({
    user: profile.id,
    plan: change.plan,
    founding: change.founding,
    eventId: event.id,
    eventType: type,
    eventAt,
  });
  return json({ ok: true, result, plan: change.plan });
}

// Purchases moved from one app user id to another (a restore on a new anonymous
// account). The new owner gets the highest plan the old owners held (or the
// event's entitlements), founding included; the old owners drop to free.
async function transfer(event: RcEvent, eventAt: string, store: Store, log: (msg: string) => void) {
  const from = await store.profiles(uuidsIn(event.transferred_from));
  const to = await store.profiles(uuidsIn(event.transferred_to));
  if (!to.length) {
    log(`revenuecat-webhook: TRANSFER ${event.id} has no matching destination profile`);
    return { ok: true, ignored: "unknown_user" };
  }
  const plan = highest([planFromEvent(event), ...from.map((p) => p.plan)]);
  const founding = from.some((p) => p.founding) || plan === "founding" ? true : null;
  const results: Record<string, string> = {};
  for (const p of from) {
    results[p.id] = await store.applyPlan({
      user: p.id, plan: "free", founding: false, eventId: `${event.id}:from:${p.id}`, eventType: "TRANSFER", eventAt,
    });
  }
  for (const p of to) {
    results[p.id] = await store.applyPlan({
      user: p.id, plan, founding, eventId: `${event.id}:to:${p.id}`, eventType: "TRANSFER", eventAt,
    });
  }
  return { ok: true, result: results, plan };
}
