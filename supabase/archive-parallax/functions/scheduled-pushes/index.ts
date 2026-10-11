// scheduled-pushes: the sanctioned scheduled push set (IMPROVEMENT_PLAN.md 3.2,
// law #9 — partner-triggered plus exactly these two, warm and guilt-free):
//   * streak-saver (~10pm couple-local): streak > 0 and exactly one member
//     played today — the other gets one honest heads-up.
//   * drift reminder: neither member played and the couple-local time is past
//     their ritual hour (profiles.notify_time) — 3 warm variants rotated
//     deterministically by date.
// Invoked HOURLY with the service-role bearer (see migrations/0022 header for
// the cron contract — no pg_net wiring is committed because the service key
// can't live in this public repo). The SQL candidate functions claim a
// per-day push_ledger row as they select, so reruns and overlapping
// invocations never double-send.
// Ops gate: the bearer must BE the service-role key (generate-drops pattern);
// verify_jwt is off in config.toml because this gate is stricter.

import {
  driftReminderBody,
  driftTitle,
  streakSaverBody,
  streakSaverTitle,
} from "./copy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function rpc<T>(fn: string): Promise<T> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!resp.ok) throw new Error(`rpc ${fn} failed: ${resp.status}`);
  return resp.json();
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
}

interface OutgoingPush {
  coupleId: string;
  message: ExpoPushMessage;
}

interface ExpoPushTicket {
  status?: string;
  message?: string;
}

// At-most-once by design: the SQL candidate RPCs burn the day's push_ledger
// claim as they select, and we never unclaim. So a failed send is a lost
// push — it MUST be loud in the logs (couple ids included), never swallowed.
// Expo caps each /push/send request at 100 messages; chunk accordingly.
const EXPO_CHUNK = 100;

async function sendExpoPush(kind: string, pushes: OutgoingPush[]): Promise<number> {
  let sent = 0;
  for (let i = 0; i < pushes.length; i += EXPO_CHUNK) {
    const chunk = pushes.slice(i, i + EXPO_CHUNK);
    const coupleIds = chunk.map((p) => p.coupleId).join(", ");
    let resp: Response;
    try {
      resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk.map((p) => p.message)),
      });
    } catch (e) {
      console.error(
        `scheduled-pushes: ${kind} expo push fetch threw (${String(e)}) — lost for couples: ${coupleIds}`,
      );
      continue;
    }
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error(
        `scheduled-pushes: ${kind} expo push failed (${resp.status}) — lost for couples: ${coupleIds}${detail ? ` — ${detail}` : ""}`,
      );
      continue;
    }
    const data = (await resp.json().catch(() => null)) as
      | { data?: ExpoPushTicket[] }
      | null;
    const tickets = Array.isArray(data?.data) ? data.data : [];
    chunk.forEach((p, idx) => {
      const ticket = tickets[idx];
      if (ticket?.status === "ok") {
        sent++;
      } else {
        console.error(
          `scheduled-pushes: ${kind} expo ticket error for couple ${p.coupleId}: ${
            ticket?.message ?? `status=${ticket?.status ?? "missing"}`
          }`,
        );
      }
    });
  }
  return sent;
}

interface StreakSaverRow {
  couple_id: string;
  target_member: string;
  push_token: string;
  partner_name: string;
  streak: number;
}

interface DriftRow {
  couple_id: string;
  target_member: string;
  push_token: string;
  partner_name: string;
  local_day: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return json({ error: "not_configured" }, 503);
  }

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer !== SERVICE_ROLE_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  // Each kind claims (the RPC burns the day's ledger rows) immediately before
  // ITS OWN send, so a failure in one kind never strands the other's claims.
  let streakCount = 0;
  let driftCount = 0;
  let sent = 0;
  const errors: string[] = [];

  try {
    const streak = await rpc<StreakSaverRow[]>("_streak_saver_candidates");
    streakCount = streak.length;
    sent += await sendExpoPush(
      "streak-saver",
      streak.map((r) => ({
        coupleId: r.couple_id,
        message: {
          to: r.push_token,
          title: streakSaverTitle(r.partner_name),
          body: streakSaverBody(r.partner_name),
          sound: "default" as const,
        },
      })),
    );
  } catch (e) {
    console.error(`scheduled-pushes: streak-saver pass failed: ${String(e)}`);
    errors.push(`streak_saver: ${String(e)}`);
  }

  try {
    const drift = await rpc<DriftRow[]>("_drift_reminder_candidates");
    driftCount = drift.length;
    sent += await sendExpoPush(
      "drift",
      drift.map((r) => ({
        coupleId: r.couple_id,
        message: {
          to: r.push_token,
          title: driftTitle(),
          body: driftReminderBody(r.partner_name, r.local_day),
          sound: "default" as const,
        },
      })),
    );
  } catch (e) {
    console.error(`scheduled-pushes: drift pass failed: ${String(e)}`);
    errors.push(`drift: ${String(e)}`);
  }

  return json(
    {
      streak_saver: streakCount,
      drift: driftCount,
      sent,
      ...(errors.length > 0 ? { errors } : {}),
    },
    errors.length > 0 ? 500 : 200,
  );
});
