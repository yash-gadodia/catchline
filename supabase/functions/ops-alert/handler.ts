export type Kind = "queue_stuck" | "worker_silent" | "failures";
export type Change = { kind: Kind; state: "open" | "resolved" };
export type Health = { stuck: number; oldest_min: number | null; worker_seen_min: number | null; failed_30m: number };
export type Push = { to: string; title: string; body: string; sound: "default"; data: { ops: true } };

export type Deps = {
  /** True when the bearer is the service role (the pg_cron health check). */
  isServiceRole(authHeader: string): boolean;
  adminIds: string[];
  pushTokens(userIds: string[]): Promise<string[]>;
  send(messages: Push[]): Promise<void>;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function openText(kind: Kind, h: Health): string {
  if (kind === "queue_stuck") return `${plural(h.stuck, "lift")} waiting over 5 min`;
  if (kind === "failures") return `${plural(h.failed_30m, "lift")} failed in 30 min`;
  return h.worker_seen_min === null ? "no worker heartbeat yet" : `worker last seen ${h.worker_seen_min} min ago`;
}

const RESOLVED: Record<Kind, string> = {
  queue_stuck: "queue moving",
  worker_silent: "worker back",
  failures: "failures back to normal",
};

// "Catchline alert" / "3 lifts waiting over 5 min, worker last seen 12 min ago".
export function message(changes: Change[], h: Health): { title: string; body: string } {
  const opened = changes.filter((c) => c.state === "open").map((c) => openText(c.kind, h));
  const resolved = changes.filter((c) => c.state === "resolved").map((c) => RESOLVED[c.kind]);
  const parts = [...opened];
  if (resolved.length) parts.push(`recovered: ${resolved.join(", ")}`);
  return { title: opened.length ? "Catchline alert" : "Catchline recovered", body: parts.join(", ") };
}

export function parseIds(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// The JWT payload's role. Only trustworthy because the function is deployed
// with verify_jwt on, so the gateway has already checked the signature.
export function jwtRole(authHeader: string): string | null {
  const part = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
  if (!part) return null;
  try {
    return (JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!deps.isServiceRole(req.headers.get("Authorization") ?? "")) return json({ error: "forbidden" }, 403);
  const { changes, health } = (await req.json()) as { changes?: Change[]; health?: Health };
  if (!changes?.length || !health) return json({ sent: 0 });
  if (!deps.adminIds.length) {
    console.warn("ops-alert: OPS_ALERT_USER_IDS is not set");
    return json({ sent: 0 });
  }
  const tokens = await deps.pushTokens(deps.adminIds);
  if (!tokens.length) {
    console.warn("ops-alert: no push token for the ops users");
    return json({ sent: 0 });
  }
  const { title, body } = message(changes, health);
  await deps.send(tokens.map((to) => ({ to, title, body, sound: "default", data: { ops: true } })));
  return json({ sent: tokens.length, title, body });
}
