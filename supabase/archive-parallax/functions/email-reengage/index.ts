// email-reengage (IMPROVEMENT_PLAN.md 3.8): a couple silent 3+ days gets ONE
// warm email per silence spell — _email_reengage_candidates enforces >=14
// days between emails per couple via the push_ledger claim, so reruns never
// double-send. Sent via the Resend HTTP API. Every specific in the email
// (streak-at-death, the partner's last-answered question) comes from real
// rows; nothing is fabricated.
// HONEST GATE: without RESEND_API_KEY this logs and no-ops BEFORE calling the
// claiming RPC, so a misconfigured run never burns a couple's silence spell.
// Ops gate: the bearer must BE the service-role key (generate-drops pattern);
// invoked hourly alongside scheduled-pushes (see migrations/0022 header).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
// onboarding@resend.dev is Resend's sandbox sender (works with no domain);
// set RESEND_FROM once the real sending domain is verified.
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Parallax <onboarding@resend.dev>";

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

interface ReengageRow {
  couple_id: string;
  target_member: string;
  email: string;
  display_name: string | null;
  partner_name: string;
  streak_at_death: number;
  last_question: string | null;
  last_answered_at: string | null;
}

function emailSubject(row: ReengageRow): string {
  const partner = row.partner_name || "your person";
  return row.streak_at_death > 0
    ? `you + ${partner} can restart the streak anytime 💛`
    : `a drop is waiting for you + ${partner} 💛`;
}

function emailText(row: ReengageRow): string {
  const name = row.display_name || "there";
  const partner = row.partner_name || "your person";
  const lines = [
    `hi ${name},`,
    "",
    `it's been a few days since you and ${partner} played parallax.`,
  ];
  if (row.streak_at_death > 0) {
    lines.push("", `you two built a ${row.streak_at_death}-day streak before the pause.`);
  }
  if (row.last_question) {
    lines.push("", `the last question ${partner} answered: "${row.last_question}"`);
  }
  lines.push(
    "",
    "today's drop is a fresh start — one question, two minutes, no catch-up required.",
    "",
    "— parallax",
  );
  return lines.join("\n");
}

// At-most-once by design: the RPC burns the 14-day ledger claim as it
// selects and we never unclaim — so any failed send MUST log the couple id,
// and one couple's failure must never abort the rest of the batch.
async function sendResendEmail(row: ReengageRow): Promise<boolean> {
  let resp: Response;
  try {
    resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [row.email],
        subject: emailSubject(row),
        text: emailText(row),
      }),
    });
  } catch (e) {
    console.error(`email-reengage: resend send threw (${String(e)}) for couple ${row.couple_id}`);
    return false;
  }
  if (!resp.ok) {
    console.error(`email-reengage: resend send failed (${resp.status}) for couple ${row.couple_id}`);
  }
  return resp.ok;
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

  if (!RESEND_API_KEY) {
    console.log(
      "email-reengage: RESEND_API_KEY not set — no-op (no candidates claimed, silence spells preserved)",
    );
    return json({ sent: 0, skipped: "resend_key_missing" });
  }

  try {
    const rows = await rpc<ReengageRow[]>("_email_reengage_candidates");
    let sent = 0;
    for (const row of rows) {
      if (await sendResendEmail(row)) sent++;
    }
    return json({ candidates: rows.length, sent, failed: rows.length - sent });
  } catch (e) {
    return json({ error: "internal_error", detail: String(e) }, 500);
  }
});
