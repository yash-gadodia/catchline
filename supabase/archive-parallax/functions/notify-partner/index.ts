// notify-partner: send an Expo push notification when a partner plays, nudges,
// or the reveal is ready.
// Uses the SERVICE ROLE key (never exposed to clients) to look up push tokens.
// The ACTOR (who played / who nudged) is read from the caller's JWT `sub` —
// the gateway has already verified the token (verify_jwt = true in config.toml),
// so decoding the payload here is safe. Never trust an actor id in the body.
// GATE: delivers only once Yash adds EAS/APNs creds + real push tokens in profiles.push_token.

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

async function dbGet(path: string) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) throw new Error(`db fetch failed: ${resp.status}`);
  return resp.json();
}

// Extract the authenticated user id from the caller's JWT.
// verify_jwt = true means the gateway already validated signature + expiry;
// we only need to decode the (base64url) payload. The anon key is a valid JWT
// with no `sub`, so unauthenticated calls yield null here.
function jwtSub(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof payload.sub === "string" && payload.sub.length > 0
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
}

// Warm nudge copy — rotated by day of month so consecutive days differ
// (nudges are rate-limited to 1/couple/day server-side).
function nudgeBody(nudgerName: string): string {
  const variants = [
    `${nudgerName} is waiting on your wavelength 👀`,
    "your person played today's drop — your move 💌",
    `${nudgerName} wants to know what you'd say today 🫶`,
  ];
  return variants[new Date().getDate() % variants.length];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return json({ error: "not_configured" }, 503);
  }

  let body: {
    couple_drop_id?: string;
    couple_id?: string;
    event?: string;
    refocus_session_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { couple_drop_id, couple_id: couple_id_in, event, refocus_session_id } = body;
  const validEvent =
    event === "played" ||
    event === "revealed" ||
    event === "paired" ||
    event === "nudge" ||
    event === "refocus";
  // 'paired' fires at pairing time (no couple_drop exists yet) and 'nudge'/
  // 'refocus' are not tied to a drop — these carry the couple_id directly;
  // 'played'/'revealed' carry the couple_drop_id.
  const needsCoupleId = event === "paired" || event === "nudge" || event === "refocus";
  if (!validEvent || (needsCoupleId ? !couple_id_in : !couple_drop_id)) {
    return json({ error: "missing_or_invalid_params" }, 400);
  }

  // 'played', 'nudge' and 'refocus' target THE OTHER member, so they need the
  // actor — taken from the verified JWT, never from the request body.
  const actor = jwtSub(req);
  if ((event === "played" || event === "nudge" || event === "refocus") && !actor) {
    return json({ error: "unauthenticated" }, 401);
  }

  try {
    // 1. Resolve couple_id — directly for 'paired'/'nudge', else via the couple_drop.
    // wave_pct is read server-side from the drop (stored by submit_answers,
    // 0014) so the 'revealed' copy is honest — never trusted from the body.
    let couple_id: string;
    let wavePct: number | null = null;
    if (needsCoupleId) {
      couple_id = couple_id_in as string;
    } else {
      const drops: Array<{
        couple_id: string;
        state: string;
        wave_pct: number | null;
      }> = await dbGet(
        `couple_drops?id=eq.${couple_drop_id}&select=couple_id,state,wave_pct`
      );
      if (!drops.length) return json({ error: "couple_drop_not_found" }, 404);
      couple_id = drops[0].couple_id;
      wavePct = typeof drops[0].wave_pct === "number" ? drops[0].wave_pct : null;
    }

    // 2. Load the couple to get both member UUIDs.
    const couples: Array<{ member_a: string | null; member_b: string | null }> =
      await dbGet(`couples?id=eq.${couple_id}&select=member_a,member_b`);
    if (!couples.length) return json({ error: "couple_not_found" }, 404);
    const { member_a, member_b } = couples[0];

    const memberIds = [member_a, member_b].filter(Boolean) as string[];
    if (!memberIds.length) return json({ sent: 0 });

    // Server-side actor verification: the caller must be a member of this couple.
    if (
      (event === "played" || event === "nudge" || event === "refocus") &&
      !memberIds.includes(actor as string)
    ) {
      return json({ error: "not_a_member" }, 403);
    }

    // 3. Load profiles for all members (push_token + display_name).
    const idList = memberIds.map((id) => `"${id}"`).join(",");
    const profiles: Array<{
      id: string;
      display_name: string | null;
      push_token: string | null;
    }> = await dbGet(
      `profiles?id=in.(${idList})&select=id,display_name,push_token`
    );

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const nameOf = (id: string | null | undefined): string =>
      (id && profileMap.get(id)?.display_name) || "your person";

    const messages: ExpoPushMessage[] = [];

    if (event === "paired") {
      // Pairing just completed. member_b is the joiner (acted in-app); push
      // member_a, who created the invite code and has been waiting.
      const waiter = member_a ? profileMap.get(member_a) : undefined;
      if (!waiter?.push_token) return json({ sent: 0 });
      const joinerName = nameOf(member_b);
      messages.push({
        to: waiter.push_token,
        title: "you're paired 💞",
        body: `${joinerName} joined you on Parallax. your first drop is ready.`,
        sound: "default",
      });
    } else if (event === "revealed") {
      // Push both members — reveal-shaped and honest: the real stored
      // wave_pct when the drop has one, a warm generic otherwise. Never
      // fabricate specifics (per-prompt misses aren't derivable here).
      for (const id of memberIds) {
        const token = profileMap.get(id)?.push_token;
        if (!token) continue;
        const partnerName = nameOf(memberIds.find((m) => m !== id));
        messages.push({
          to: token,
          title: `you + ${partnerName} are revealed 💞`,
          body:
            wavePct === null
              ? "today's reveal is ready. see how in-sync you were."
              : `${partnerName} guessed your answers — ${wavePct}% on the same wavelength today 👀`,
          sound: "default",
        });
      }
    } else if (event === "nudge") {
      // Push the actor's partner with warm rotating copy.
      const partnerId = memberIds.find((id) => id !== actor);
      if (!partnerId) return json({ sent: 0 });
      const partner = profileMap.get(partnerId);
      if (!partner?.push_token) return json({ sent: 0 });
      const nudgerName = nameOf(actor);
      messages.push({
        to: partner.push_token,
        title: `a nudge from ${nudgerName} 💛`,
        body: nudgeBody(nudgerName),
        sound: "default",
      });
    } else if (event === "refocus") {
      // A refocus session just started — ping the initiator's partner to add
      // their side (IMPROVEMENT_PLAN.md 4.6). Behind f1_partner_notify
      // (V2_PLAN §4-F1) the phrasing goes async — "for whenever you're
      // ready", never an interrupt — and may include the session topic, read
      // server-side (never from the request body).
      const partnerId = memberIds.find((id) => id !== actor);
      if (!partnerId) return json({ sent: 0 });
      const partner = profileMap.get(partnerId);
      if (!partner?.push_token) return json({ sent: 0 });
      const initiatorName = nameOf(actor);

      let asyncCopy = false;
      try {
        const flags: Array<{ enabled: boolean }> = await dbGet(
          "feature_flags?key=eq.f1_partner_notify&select=enabled"
        );
        asyncCopy = flags.length > 0 && flags[0].enabled === true;
      } catch {
        // flag lookup failure -> legacy copy (fail-safe, never fail-open)
      }

      if (asyncCopy) {
        // copy: Dani pass pending (V2 F1 placeholder)
        let topic: string | null = null;
        if (refocus_session_id) {
          try {
            const sessions: Array<{
              couple_id: string;
              initiator: string;
              is_solo: boolean;
              topic: string;
            }> = await dbGet(
              `refocus_sessions?id=eq.${refocus_session_id}&select=couple_id,initiator,is_solo,topic`
            );
            const s = sessions[0];
            // Only trust a topic that belongs to this couple, was started by
            // the verified actor, and is a two-sided session.
            if (
              s &&
              s.couple_id === couple_id &&
              s.initiator === actor &&
              !s.is_solo
            ) {
              topic = s.topic;
            }
          } catch {
            // no topic -> generic async copy
          }
        }
        messages.push({
          to: partner.push_token,
          title: `${initiatorName} left you something 💛`,
          body: topic
            ? `about ${topic} — for whenever you're ready. no rush.`
            : "a rough moment they want to untangle together — for whenever you're ready. no rush.",
          sound: "default",
        });
      } else {
        messages.push({
          to: partner.push_token,
          title: `${initiatorName} wants to refocus something 💛`,
          body: "add your side when you're ready",
          sound: "default",
        });
      }
    } else {
      // event === 'played': the submitter is the verified JWT caller; push the
      // OTHER member (the one still waiting to answer).
      const partnerId = memberIds.find((id) => id !== actor);
      if (!partnerId) return json({ sent: 0 });

      const partner = profileMap.get(partnerId);
      if (!partner?.push_token) return json({ sent: 0 });

      const submitterName = nameOf(actor);
      messages.push({
        to: partner.push_token,
        title: `${submitterName} played today's drop 👀`,
        body: "no peeking — answer yours to unlock the reveal 💛",
        sound: "default",
      });
    }

    await sendExpoPush(messages);
    return json({ sent: messages.length });
  } catch (e) {
    return json({ error: "internal_error", detail: String(e) }, 500);
  }
});
