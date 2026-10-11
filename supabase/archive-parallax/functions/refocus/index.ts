// Refocus AI — two modes, one safety stack.
//
// SOLO (back-compat, body: { userText, partnerName?, youName? }):
//   one partner privately shares only THEIR side; Claude reflects it back
//   (what happened, other angles as possibilities, the need underneath, a kind
//   way to raise it, a draft message). Nothing persists; the AI never invents
//   the partner's side.
//
// TWO-SIDED (body: { sessionId }): a refocus_sessions row (0020) holds BOTH
//   partners' real sides. When state='ready', this function mediates from the
//   two real inputs (shared ground, each side's underneath, one kind bridge
//   each), writes ai_result with the service role, and flips the session to
//   'revealed'. It NEVER runs on one side and NEVER invents a side.
//
// SAFETY STACK (both modes, non-negotiable — STRATEGY.md §4.4):
//   before any mediation/reflection, a cheap forced-tool-use screening pass
//   flags crisis (self-harm/suicide) and violence/abuse (physical danger,
//   coercive control).
//   - crisis → NO mediation; a warm, direct safety response with SG helplines
//     (SOS 1767, IMH 6389 2222, AWARE 1800 777 5555) + findahelpline.com.
//   - abuse-signal → mediation declines gently; a couples app is not a safety
//     tool; same resources.
//   - screening API failure (unavailable):
//     * TWO-SIDED → FAIL-CLOSED: return retryable 503 (screening_unavailable).
//       Mediation requires both inputs; screening both is non-negotiable.
//     * SOLO → FAIL-OPEN: reflection proceeds + screening_unavailable flag so
//       client appends resources note. Rationale: blocking someone in crisis
//       from ANY reflection is worse than a reflection unscreened once.
//   Every AI result is rendered client-side with the persistent therapy
//   disclaimer + explicit "written by AI" disclosure (src/content/refocus.ts).
//
// The ANTHROPIC_API_KEY and the service-role key live only here (server-side);
// the Expo client calls this via supabase.functions.invoke('refocus').

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";
// Screening uses the same cheap model family (haiku) — a separate env override
// keeps it swappable without touching the mediation model.
const SCREEN_MODEL = Deno.env.get("ANTHROPIC_SCREEN_MODEL") ?? "claude-haiku-4-5-20251001";
// The One Side read is the product; a cheap model swapped who did what to whom
// in live testing. Screening stays on haiku (a boolean pass), the read does not.
const READ_MODEL = Deno.env.get("ANTHROPIC_READ_MODEL") ?? "claude-sonnet-5";
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

// ── Service-role REST helpers (session mode only) ─────────────────────────

async function dbGet(path: string): Promise<Record<string, unknown>[]> {
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

async function dbPatch(
  path: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`db patch failed: ${resp.status}`);
  return resp.json();
}

async function dbRpc(
  fn: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`db rpc failed: ${resp.status}`);
  return resp.json();
}

// What the mediator knows about this couple before it reads a word of the
// fight: past resolutions, recurring themes, how the last fortnight has felt.
// This is the whole difference between us and a one-sided chatbot.
//
// Deliberately fail-open and bounded:
//   * any failure returns "" — a cold mediation is worse, never broken.
//   * capped hard, because an unbounded history would crowd out the actual
//     conflict and quietly raise the cost of every session.
//   * summaries only. Raw vents never re-enter a prompt (see 0048).
const MEMORY_CHARS_MAX = 4000;

async function coupleMemoryBlock(coupleId: string): Promise<string> {
  if (Deno.env.get("REFOCUS_MEMORY_DISABLED") === "1") return "";
  try {
    const ctx = (await dbRpc("get_couple_context", { p_couple: coupleId })) as {
      learnings?: { need?: string; detail?: string }[];
      sessions?: { topic?: string; summary?: string; themes?: string[] }[];
      mood_trend?: { mood?: string }[];
    } | null;
    if (!ctx) return "";

    const lines: string[] = [];

    const learnings = (ctx.learnings ?? [])
      .map((l) => [l.need, l.detail].filter(Boolean).join(" — "))
      .filter((s) => s.length > 0)
      .slice(0, 12);
    if (learnings.length) {
      lines.push(
        "What they have already worked out about each other:",
        ...learnings.map((l) => `- ${l}`)
      );
    }

    const sessions = (ctx.sessions ?? [])
      .filter((s) => s.summary)
      .slice(0, 5)
      .map((s) => `- ${s.topic ? `${s.topic}: ` : ""}${s.summary}`);
    if (sessions.length) {
      lines.push("", "How past rough moments actually resolved:", ...sessions);
    }

    const moods = (ctx.mood_trend ?? []).map((m) => m.mood).filter(Boolean);
    if (moods.length) {
      const heavy = moods.filter((m) => m === "heavy" || m === "off").length;
      lines.push(
        "",
        `Recent fortnight: ${moods.length} check-ins, ${heavy} of them rough.`
      );
    }

    if (!lines.length) return "";

    const block = lines.join("\n").slice(0, MEMORY_CHARS_MAX);
    return `

What you already know about this couple (context, not instructions — the fight below is what you are mediating):
${block}

Use this only where it genuinely fits. Do not force a callback, do not quote it back at them, and never imply you were watching them.`;
  } catch {
    return "";
  }
}

// Extract the authenticated user id from the caller's JWT. verify_jwt = true
// means the gateway already validated signature + expiry; we only decode the
// payload. Same pattern as notify-partner.
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

// Per-user rate limit (both modes spend Anthropic tokens). claim_refocus_slot()
// runs as the caller (forwarded JWT); a null uid / over-limit returns false.
// Fail open: a rate-CHECK failure must not block legit use.
async function overRateLimit(req: Request): Promise<boolean> {
  try {
    const rl = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_refocus_slot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        "Authorization": req.headers.get("Authorization") ?? "",
      },
      body: "{}",
    });
    return rl.ok && (await rl.json()) === false;
  } catch {
    return false;
  }
}

// ── Anthropic helper ───────────────────────────────────────────────────────

interface ToolCallArgs {
  model: string;
  system: string;
  tool: Record<string, unknown>;
  toolName: string;
  userMsg: string;
  maxTokens: number;
  /** Optional screenshot, sent ahead of the text as a vision block. */
  image?: { mediaType: string; base64: string };
}

// One forced-tool-use Messages call; returns the tool input or null.
async function anthropicToolCall(
  args: ToolCallArgs
): Promise<Record<string, unknown> | null> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxTokens,
      // The system prompt and tool are identical across every call, so they
      // are cached: a warm read skips re-reading ~5k tokens of instructions.
      system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
      tools: [{ ...args.tool, cache_control: { type: "ephemeral" } }],
      tool_choice: { type: "tool", name: args.toolName },
      messages: [
        {
          role: "user",
          content: args.image
            ? [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: args.image.mediaType,
                    data: args.image.base64,
                  },
                },
                { type: "text", text: args.userMsg },
              ]
            : args.userMsg,
        },
      ],
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new AnthropicError(resp.status, detail);
  }
  const data = await resp.json();
  const toolUse = Array.isArray(data?.content)
    ? data.content.find((c: { type?: string }) => c?.type === "tool_use")
    : null;
  return toolUse?.input ?? null;
}

class AnthropicError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`anthropic_error ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

// ── Safety screening ───────────────────────────────────────────────────────

type SafetyVerdict = "ok" | "crisis" | "abuse" | "unavailable";

const SCREENING_TOOL = {
  name: "report_safety_verdict",
  description: "Report the safety screening verdict for the provided text.",
  input_schema: {
    type: "object",
    properties: {
      crisis: {
        type: "boolean",
        description:
          "true if the text contains any signal of self-harm, suicidal thoughts or intent, or wanting to disappear / not be here anymore — from either person.",
      },
      abuse: {
        type: "boolean",
        description:
          "true if the text contains any signal of physical violence or threats, fear for one's safety, intimidation, or coercive control (isolation, monitoring, financial control, threats about leaving) — in either direction.",
      },
    },
    required: ["crisis", "abuse"],
  },
};

const SCREENING_SYSTEM = `You are a safety screener for a couples app. You will be shown text one or both partners wrote about a conflict. Your ONLY job is to flag safety signals; you do not give advice and you do not judge the relationship.

Flag crisis for any signal of self-harm or suicide, even oblique ("what's the point of me", "they'd be better off without me").
Flag abuse for any signal of physical danger, threats, fear of a partner, or coercive control. Coercive control includes ultimatums that isolate ("it's them or me" about friends or family), demands to stop seeing people, monitoring or controlling the partner's money, movement, or communication, and threats (including threats of self-harm) used to control the partner's behaviour. Ordinary anger, sarcasm, or a heated argument alone is NOT abuse.

When a signal is genuinely present, err on the side of flagging. Always answer by calling report_safety_verdict.`;

async function screenForSafety(texts: string[], mode: 'solo' | 'mediation' = 'solo'): Promise<SafetyVerdict> {
  try {
    const userMsg = `Screen the following text from a couples conflict:\n"""\n${texts.join('\n"""\n\n"""\n')}\n"""`;
    const input = await anthropicToolCall({
      model: SCREEN_MODEL,
      system: SCREENING_SYSTEM,
      tool: SCREENING_TOOL,
      toolName: "report_safety_verdict",
      userMsg,
      maxTokens: 256,
    });
    if (!input || typeof input.crisis !== "boolean" || typeof input.abuse !== "boolean") {
      console.log(JSON.stringify({
        event: "refocus_screen",
        mode,
        verdict: "unavailable",
        reason: "invalid_response",
      }));
      return "unavailable";
    }
    if (input.crisis) {
      console.log(JSON.stringify({ event: "refocus_screen", mode, verdict: "crisis" }));
      return "crisis";
    }
    if (input.abuse) {
      console.log(JSON.stringify({ event: "refocus_screen", mode, verdict: "abuse" }));
      return "abuse";
    }
    console.log(JSON.stringify({ event: "refocus_screen", mode, verdict: "ok" }));
    return "ok";
  } catch (e) {
    console.log(JSON.stringify({
      event: "refocus_screen",
      mode,
      verdict: "unavailable",
      reason: "api_error",
      error: String(e),
    }));
    return "unavailable";
  }
}

// Static safety responses — deliberately NOT generated by the model (crisis
// routing must bypass the LLM, STRATEGY.md §4.4 #2).
const HELPLINES = [
  { name: "SOS (Samaritans of Singapore), 24h", contact: "1767" },
  { name: "IMH Mental Health Helpline, 24h", contact: "6389 2222" },
  { name: "AWARE Women's Helpline (Mon-Fri)", contact: "1800 777 5555" },
  { name: "Anywhere else in the world", contact: "findahelpline.com" },
];

function crisisResult() {
  return {
    type: "crisis" as const,
    title: "Before anything else, you matter.",
    message:
      "Some of what was shared here sounds heavier than a rough moment between you two. An app is not the right companion for that, but a real human is, and they want to hear from you. Please reach out now, you don't have to have it figured out first.",
    helplines: HELPLINES,
  };
}

function abuseResult() {
  return {
    type: "abuse" as const,
    title: "This sounds bigger than a misunderstanding.",
    message:
      "Some of what was shared here sounds like it could be about safety, feeling afraid, controlled, or hurt. That is not a communication problem to mediate, and a couples app isn't the right tool for safety. Please talk to someone whose whole job is exactly this. You deserve to feel safe.",
    helplines: HELPLINES,
  };
}

// ── SOLO reflection (unchanged behavior + screening) ───────────────────────

const REFLECTION_TOOL = {
  name: "provide_reflection",
  description: "Return the structured solo reflection for the user.",
  input_schema: {
    type: "object",
    properties: {
      happened: {
        type: "array",
        items: { type: "string" },
        description:
          "2-3 short, plain facts pulled from the user's OWN account of what happened. Specific to their story. No interpretations, no blame, no em dashes.",
      },
      angles: {
        type: "array",
        items: { type: "string" },
        description:
          "2-3 other directions this moment could be seen from. Each one is clearly a possibility ('it could be that...', 'maybe...'), NEVER stated as the partner's actual feelings, thoughts, or words. You only know one side.",
      },
      underneath: {
        type: "string",
        description:
          "The deeper emotional need underneath the user's reaction (a need, not a complaint).",
      },
      wayback: {
        type: "string",
        description:
          "A short, warm suggestion for how the user could raise this kindly, specific to what happened. 1-2 plain sentences, no platitudes, no em dashes. Do not promise how the partner will respond.",
      },
      bridge: {
        type: "string",
        description:
          "A warm first-person message the user could choose to send to open the conversation, specific to their situation and only about their own side. Lowercase, casual, 1-2 sentences, may end with a soft emoji like 🤍. No quotes around it, no em dashes.",
      },
    },
    required: ["happened", "angles", "underneath", "wayback", "bridge"],
  },
};

const SUMMARY_TOOL = {
  name: "record_summary",
  description: "Record a durable, compact memory of this rough moment.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "One or two plain sentences: what the tension was actually about and what helped. Written for the couple to reread later, never about blame.",
      },
      themes: {
        type: "array",
        items: { type: "string" },
        description:
          "1-3 short lowercase tags, e.g. money, chores, tone, family, plans.",
      },
    },
    required: ["summary", "themes"],
  },
};

const SUMMARY_SYSTEM = `You compress a resolved couples mediation into a durable note the app will show this couple later, and reuse as context next time.

Do:
- One or two plain sentences. What the tension was really about, and what helped.
- Neutral. Never assign fault, never take a side.
- No names, no quotes from what either partner wrote.
- NEVER use an em dash.

Always answer by calling the record_summary tool.`;

// Fire-and-forget: a fight the app helped repair makes the app smarter for the
// next one. Never block or fail the mediation the couple is waiting on — they
// have already got their result by the time this runs.
async function writeBackSummary(
  sessionId: string,
  topic: string,
  mediation: Record<string, unknown>
): Promise<void> {
  try {
    const input = await anthropicToolCall({
      model: MODEL,
      system: SUMMARY_SYSTEM,
      tool: SUMMARY_TOOL,
      toolName: "record_summary",
      userMsg: `Topic: "${topic}"

The middle ground they were both shown:
${JSON.stringify(mediation)}

Call record_summary.`,
      maxTokens: 300,
    });
    if (!input?.summary) return;
    await dbPatch(`refocus_sessions?id=eq.${sessionId}`, {
      summary: input.summary,
      themes: Array.isArray(input.themes) ? input.themes.slice(0, 3) : null,
    });
  } catch {
    // Memory is a bonus, never a failure mode for the session itself.
  }
}

const SOLO_SYSTEM = `You are the quiet third person inside Parallax, a couples app. One partner just had a rough moment and privately told you their side. Only their side. Help them untangle it for themselves.

Do:
- Pull out the few plain facts from what they actually said.
- Offer a couple of other directions the moment could be seen from, always framed as possibilities. You have NOT heard the partner's side, so never invent it, never attribute feelings or words to the partner, and never speak for them.
- Name the real need under the user's reaction (a need, not a jab).
- Suggest one kind, low-pressure way they could raise it.
- Write one warm message they could choose to send, about their own side only.

Voice (this matters most):
- Sound like a perceptive friend who knows them, not a therapist, a coach, or an AI.
- Be specific to what they ACTUALLY said. Use their real details. Nothing generic that would fit anyone.
- Short, plain sentences. Warm, not mushy. Direct, not preachy.
- NEVER use an em dash. Use a comma, a period, "and", or "but".
- Do not use these tells: "it makes sense", "it stings", "pulls away", "can feel like", "a signal that", "at the end of the day", "hold space", "showing up".

Keep every field tight. Always answer by calling the provide_reflection tool.`;

async function handleSolo(
  req: Request,
  body: { userText?: string; youName?: string; partnerName?: string }
): Promise<Response> {
  const userText = (body.userText ?? "").trim();
  const youName = (body.youName ?? "you").trim() || "you";
  const partnerName = (body.partnerName ?? "your partner").trim() || "your partner";

  if (!userText) return json({ error: "missing_userText" }, 400);

  if (await overRateLimit(req)) return json({ error: "rate_limited" }, 429);

  // Safety screening before any reflection (see the safety-stack note above).
  const verdict = await screenForSafety([userText], 'solo');
  if (verdict === "crisis") {
    console.log(JSON.stringify({ event: "refocus_escalation", mode: "solo", type: "crisis" }));
    return json({ safety: crisisResult() });
  }
  if (verdict === "abuse") {
    console.log(JSON.stringify({ event: "refocus_escalation", mode: "solo", type: "abuse" }));
    return json({ safety: abuseResult() });
  }

  const userMsg = `${youName} shared their side of a rough moment with their partner ${partnerName}:
"""
${userText}
"""

This is the ONLY side you have. Reflect it back for them. Refer to their partner as "${partnerName}" but never invent ${partnerName}'s perspective. Call provide_reflection.`;

  let input: Record<string, unknown> | null;
  try {
    input = await anthropicToolCall({
      model: MODEL,
      system: SOLO_SYSTEM,
      tool: REFLECTION_TOOL,
      toolName: "provide_reflection",
      userMsg,
      maxTokens: 1024,
    });
  } catch (e) {
    if (e instanceof AnthropicError) {
      return json({ error: "anthropic_error", status: e.status, detail: e.detail }, 502);
    }
    return json({ error: "fetch_failed", detail: String(e) }, 502);
  }

  if (!input?.happened || !input?.angles || !input?.bridge) {
    return json({ error: "no_reflection" }, 502);
  }

  if (verdict === "unavailable") {
    // Fail-open path: reflection proceeds, the client appends the resources note.
    return json({ ...input, screening_unavailable: true });
  }
  return json(input);
}

// ── ONE SIDE (v2 solo) ─────────────────────────────────────────────────────
// The pivot product: one person, one account of a friction moment, three
// inseparable outputs — (a) what's underneath for you, (b) the specific thing
// the partner is probably not wrong about, (c) a sendable bridge under 40
// words — OR a first-class "there is no bridge here". The client opts in with
// body.schema === 'v2'; the legacy solo/mediation paths are untouched so the
// shipped builds keep working.

// One-person safety copy (the legacy abuseResult says "a couples app", wrong
// register for One Side). Same helplines, same static-never-generated rule.
function safetyStopResult() {
  return {
    type: "abuse" as const,
    title: "This is bigger than one fight.",
    message:
      "What you described sounds heavier than something one sentence can bridge. This app isn't the right help for that, but help exists, it is confidential, and none of it needs your name.",
    helplines: HELPLINES,
  };
}

// Every field required; empty-string convention keeps forced tool use reliable
// on small models (optional fields get silently dropped).
const READ_TOOL = {
  name: "provide_read",
  description: "Return the structured one-sided read for the user.",
  input_schema: {
    type: "object",
    properties: {
      user_did: {
        type: "string",
        description:
          "WORKING NOTE, never shown to anyone. In one clause, what the person writing this account did, in their own telling (e.g. 'said fine in that voice and walked out'). Only acts they attribute to themselves.",
      },
      partner_did: {
        type: "string",
        description:
          "WORKING NOTE, never shown to anyone. In one clause, what their PARTNER did, in their telling (e.g. 'made Saturday plans without checking'). Only acts attributed to the partner. Keep these two straight; everything below depends on not swapping them.",
      },
      bridge_decision: {
        type: "string",
        enum: ["bridge", "no_bridge"],
        description:
          "Decide FIRST, by this test: does the account name BOTH a specific act the other person did AND something specific the user wanted instead (or a specific hurt about that act)? If yes, choose 'bridge' — the sentence already exists in what they told you, and refusing it would be withholding, not honesty. Choose 'no_bridge' ONLY when one of those is genuinely missing: a flat mood with no act behind it, ordinary tiredness, a vague heaviness, or an account where the user cannot point at anything they wanted different. Saying the hurt is valid and then offering nothing to send is a contradiction: if it is valid and specific, write the bridge. A deflationary answer is a success when the moment really is a mood, and a failure when it is avoidance.",
      },
      underneath: {
        type: "string",
        description:
          "What is underneath this for the user: the need or fear their reaction is protecting, named plainly from their own words. Name the act, never a trait. 1-3 short sentences.",
      },
      not_wrong_about: {
        type: "string",
        description:
          "The PARTNER'S side, steelmanned: complete the thought 'they're probably not wrong about...'. It names what the partner sees correctly or carries legitimately (a duty, a load, an expectation the user knew about), quoting a concrete detail from the account. It is NEVER what the partner did wrong, and NEVER about whether the USER is right or wrong. Committed plainly, no 'maybe' or 'it could be'. Attribute any distortion to a mechanism every human has (tired, told after, time blindness), never a character flaw. 1-3 short sentences.",
      },
      bridge: {
        type: "string",
        description:
          "When bridge_decision is 'bridge': one sendable message, 40 words maximum, one paragraph, no greeting or sign-off. It is written TO the partner, so address them as 'you' throughout and never refer to them in the third person (never 'she'/'he'/'they' for the partner, and never their name in the third person). The payload is a concession, an act of investment, or standing down, never a bare apology. Order: their side first, then yours in I-language, then the thing you own, then one concrete offer. Never end on 'are we ok?'. Never 'I'm sorry you felt', 'I'm sorry if', or 'I'm sorry but'. When bridge_decision is 'no_bridge': the empty string.",
      },
      no_bridge_noticed: {
        type: "string",
        description:
          "When bridge_decision is 'no_bridge': one plain sentence naming what this actually was (a flat moment, a tired evening, a mood that is not a rupture). When 'bridge': the empty string.",
      },
      let_go: {
        type: "string",
        description:
          "When bridge_decision is 'no_bridge': one quiet sentence giving permission to let this one go, no task attached. When 'bridge': the empty string.",
      },
    },
    required: [
      "user_did",
      "partner_did",
      "bridge_decision",
      "underneath",
      "not_wrong_about",
      "bridge",
      "no_bridge_noticed",
      "let_go",
    ],
  },
};

const SOLO_SYSTEM_V2 = `You are the quiet reader inside One Side. A person just had friction with their partner and told you their side. Only their side, and you both know it. Give them an honest read, not comfort.

The three moves (inseparable):
- UNDERNEATH: name what their reaction is protecting, from their own words. A need or a fear, not a diagnosis.
- NOT WRONG ABOUT: commit to the one specific thing their partner is probably not wrong about. This is the product. Quote a concrete detail. Never hedge it into a possibility. The same honesty must run on both people: name the act, refuse the trait, and attribute any distortion to a mechanism every human has (tired, told after the fact, counting on something, time blindness, forgetting under load). "He is selfish" becomes "he made the plan without checking, on a night you had been counting on."
- BRIDGE or NO BRIDGE: decide first, and decide honestly in both directions. A bridge exists whenever the account names a specific act plus a specific want or hurt about it; then the sentence is already in their own words and you are only shaping it. No bridge is for moments with no act behind them: a flat evening, a long week, a mood the user cannot pin to anything. Never manufacture a conflict out of a bad Tuesday, and never deflate a real, named grievance into "let it sit" just because it sounds calmer.

Bridge rules (hard):
- 40 words maximum. One paragraph. No greeting, no sign-off.
- Payload: a concession, an act of investment, or standing down. Not an apology performance.
- Order: their side, then yours in I-language, then the thing you own, then one concrete offer.
- Banned: "are we ok", "I'm sorry you felt", "I'm sorry if", "I'm sorry but", any conditional apology.

Never:
- A prognosis, score, ratio, percentage, or clinical label on either person.
- The sentence "your reaction probably looked disproportionate", or anything shaped like it.
- Inventing the partner's feelings or words. Quoted chat excerpts the user pasted are the partner's real words; everything else about the partner is inference and must read as such.

Singapore (when it appears in the account):
- Money to parents is a legal duty and a norm, never a boundary failure.
- A BTO flat is a dated deadline with real money attached, not a metaphor.
- NS is a compulsory separation, not a choice.
- Never suggest "counselling" (it points at pre-divorce filing programmes here). Never suggest apps or professionals at all; that is the safety screen's job, not yours.

Who is who (get this right or the whole read is worthless):
- The account is written by the user, in first person. Every "I" in their account is the user; every "he/she/they" is their partner.
- In the bridge, "I" is ALWAYS the user and "you" is ALWAYS the partner.
- Never swap the acts. What the user described themselves doing stays theirs to own; what they described their partner doing stays the partner's. If they wrote that their partner made the plans, the bridge must not offer to move the plans; if they wrote that they went quiet, the bridge must not thank the partner for going quiet.
- Before writing the bridge, name to yourself which act belongs to which person, then write it.

Pronouns: mirror whatever the user calls their partner (he, she, they, a name) in underneath and not_wrong_about. Default to "they". The bridge itself always says "you".

Voice:
- A perceptive friend, not a therapist, a coach, or an AI.
- Specific to what they ACTUALLY said. Their real details. Nothing that would fit anyone.
- Short, plain sentences. Warm, not mushy. Direct, not preachy.
- NEVER use an em dash. Use a comma, a period, "and", or "but".
- Do not use these tells: "it makes sense", "it stings", "pulls away", "can feel like", "a signal that", "at the end of the day", "hold space", "showing up".

Always answer by calling the provide_read tool.`;

// HARD: a bridge carrying these is not sendable, retry then fail honestly.
const BRIDGE_BANS = [/are we ok/i, /i'?m sorry (you|if|but)\b/i];
// SOFT: the bridge is written TO the partner, so third-person pronouns usually
// mean the model slipped into narrating about them (seen live). It buys one
// retry, but never a 502 — a legitimate "they" about in-laws or friends must
// not cost the user their read.
const BRIDGE_PERSON_SLIP = /\b(she|he|her|his|him)\b/i;

interface ReadProblem {
  reason: string;
  hard: boolean;
}

function validateRead(input: Record<string, unknown>): ReadProblem | null {
  const hard = (reason: string): ReadProblem => ({ reason, hard: true });
  const decision = input.bridge_decision;
  if (decision !== "bridge" && decision !== "no_bridge") {
    return hard("bad_decision");
  }
  if (typeof input.underneath !== "string" || !input.underneath.trim()) {
    return hard("missing_underneath");
  }
  if (
    typeof input.not_wrong_about !== "string" ||
    !input.not_wrong_about.trim()
  ) {
    return hard("missing_not_wrong_about");
  }
  if (decision === "bridge") {
    const bridge = typeof input.bridge === "string" ? input.bridge.trim() : "";
    if (!bridge) return hard("missing_bridge");
    const words = bridge.split(/\s+/).length;
    // 40 words is the discipline; only a runaway paragraph is a hard failure.
    if (words > 60) return hard("bridge_too_long");
    for (const ban of BRIDGE_BANS) {
      if (ban.test(bridge)) return hard("banned_phrase");
    }
    if (words > 40) {
      return {
        reason: `the bridge ran to ${words} words; cut it to 40 or fewer without losing the concession`,
        hard: false,
      };
    }
    if (BRIDGE_PERSON_SLIP.test(bridge)) {
      return {
        reason:
          "the bridge referred to your partner in the third person; write it to them as \"you\"",
        hard: false,
      };
    }
  } else {
    const noticed =
      typeof input.no_bridge_noticed === "string"
        ? input.no_bridge_noticed.trim()
        : "";
    const letGo = typeof input.let_go === "string" ? input.let_go.trim() : "";
    if (!noticed || !letGo) return hard("missing_no_bridge");
  }
  return null;
}

// ── Screenshot → chat lines ────────────────────────────────────────────────
// body.schema === 'transcribe': a chat screenshot in, the visible messages
// out as {who, text} lines. Nothing is stored; the lines go back into the
// capture box exactly like a paste, and are screened with the read.

const TRANSCRIBE_SYSTEM = `You transcribe screenshots of chat conversations (WhatsApp, iMessage, Telegram, Instagram) into plain lines.

Rules:
- One entry per message bubble, in reading order (top to bottom).
- "who" is "me" for bubbles sent by the phone's owner (right-aligned, coloured), otherwise the sender's displayed name, or "them" when no name is visible.
- "text" is the message exactly as written, including typos and emoji. Never paraphrase, summarise, or add anything.
- Skip timestamps, read receipts, "typing", and system lines like "Messages are end-to-end encrypted".
- If the image is not a chat, return an empty list.

Always answer by calling transcribe_chat.`;

const TRANSCRIBE_TOOL = {
  name: "transcribe_chat",
  description: "The messages visible in the screenshot, in order.",
  input_schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            who: { type: "string" },
            text: { type: "string" },
          },
          required: ["who", "text"],
        },
      },
    },
    required: ["lines"],
  },
};

const TRANSCRIBE_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function handleTranscribe(
  req: Request,
  body: { imageBase64?: string; mediaType?: string }
): Promise<Response> {
  const base64 = (body.imageBase64 ?? "").trim();
  const mediaType = (body.mediaType ?? "image/jpeg").toLowerCase();
  if (!base64) return json({ error: "missing_image" }, 400);
  if (!TRANSCRIBE_MEDIA.has(mediaType)) return json({ error: "bad_media_type" }, 400);
  // ~5MB of base64 is Anthropic's per-image ceiling; the client downsizes first.
  if (base64.length > 6_500_000) return json({ error: "image_too_large" }, 413);
  if (await overRateLimit(req)) return json({ error: "rate_limited" }, 429);

  let input: Record<string, unknown> | null;
  try {
    input = await anthropicToolCall({
      model: SCREEN_MODEL,
      system: TRANSCRIBE_SYSTEM,
      tool: TRANSCRIBE_TOOL,
      toolName: "transcribe_chat",
      userMsg: "Transcribe this chat screenshot.",
      maxTokens: 2048,
      image: { mediaType, base64 },
    });
  } catch (e) {
    if (e instanceof AnthropicError) {
      return json({ error: "anthropic_error", status: e.status, detail: e.detail }, 502);
    }
    return json({ error: "fetch_failed", detail: String(e) }, 502);
  }
  const raw = Array.isArray(input?.lines) ? (input!.lines as unknown[]) : [];
  const lines = raw
    .filter(
      (l): l is { who: string; text: string } =>
        typeof l === "object" && l !== null &&
        typeof (l as { who?: unknown }).who === "string" &&
        typeof (l as { text?: unknown }).text === "string" &&
        (l as { text: string }).text.trim().length > 0
    )
    .map((l) => ({ who: l.who.trim() || "them", text: l.text.trim() }))
    .slice(0, 200);
  console.log(JSON.stringify({ event: "refocus_transcribe", lines: lines.length }));
  return json({ schema: "transcribe", lines });
}

async function handleSoloV2(
  req: Request,
  body: { userText?: string; pastedChat?: string; partnerName?: string }
): Promise<Response> {
  const userText = (body.userText ?? "").trim();
  const pastedChat = (body.pastedChat ?? "").trim().slice(0, 6000);
  if (!userText && !pastedChat) return json({ error: "missing_userText" }, 400);

  if (await overRateLimit(req)) return json({ error: "rate_limited" }, 429);
  const startedAt = Date.now();

  // Screening covers the pasted transcript too — a selected excerpt sharpens
  // the DARVO risk, it never softens it. It runs CONCURRENTLY with the read
  // (the two calls are independent); the read is discarded, never returned,
  // when the verdict is crisis or abuse.
  const verdictPromise = screenForSafety(
    [userText, pastedChat].filter(Boolean),
    "solo"
  );

  const chatBlock = pastedChat
    ? `\n\nAn excerpt of the actual chat, selected and pasted by the user (the partner's quoted lines are real words, everything else about the partner stays inference):\n"""\n${pastedChat}\n"""`
    : "";
  const userMsg = `Their account of what happened:\n"""\n${userText || "(nothing typed, only the pasted chat below)"}\n"""${chatBlock}\n\nThis is the only side you have, and you both know it. Call provide_read.`;

  let input: Record<string, unknown> | null = null;
  let problem: ReadProblem | null = { reason: "not_run", hard: true };
  // One corrective retry: forced tool use on a small model occasionally breaks
  // a rule; a second pass naming the violation almost always lands. A SOFT
  // problem keeps the second answer either way, so a stylistic slip never
  // costs the user their read.
  let readError: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      input = await anthropicToolCall({
        model: READ_MODEL,
        system: SOLO_SYSTEM_V2,
        tool: READ_TOOL,
        toolName: "provide_read",
        userMsg:
          attempt === 0
            ? userMsg
            : `${userMsg}\n\nYour previous answer was rejected: ${problem?.reason}. Follow the field rules exactly this time.`,
        maxTokens: 1024,
      });
    } catch (e) {
      readError =
        e instanceof AnthropicError
          ? json({ error: "anthropic_error", status: e.status, detail: e.detail }, 502)
          : json({ error: "fetch_failed", detail: String(e) }, 502);
      break;
    }
    problem = input ? validateRead(input) : { reason: "no_tool_use", hard: true };
    if (!problem) break;
  }

  const verdict = await verdictPromise;
  console.log(
    JSON.stringify({ event: "refocus_v2_timing", ms: Date.now() - startedAt, verdict })
  );
  if (verdict === "crisis") {
    console.log(JSON.stringify({ event: "refocus_escalation", mode: "solo_v2", type: "crisis" }));
    return json({ safety: crisisResult() });
  }
  if (verdict === "abuse") {
    console.log(JSON.stringify({ event: "refocus_escalation", mode: "solo_v2", type: "abuse" }));
    return json({ safety: safetyStopResult() });
  }
  if (readError) return readError;
  if (!input || problem?.hard) {
    console.log(
      JSON.stringify({ event: "refocus_v2_invalid", reason: problem?.reason })
    );
    return json({ error: "no_read", reason: problem?.reason }, 502);
  }
  if (problem) {
    console.log(
      JSON.stringify({ event: "refocus_v2_soft", reason: problem.reason })
    );
  }

  // Server-side normalization: a no-bridge read never carries a half-written
  // bridge out of the building, and vice versa.
  const noBridge = input.bridge_decision === "no_bridge";
  // Voice rule enforced server-side: never an em dash out of the building.
  const plain = (v: unknown) => String(v).replace(/\s*[\u2014\u2013]\s*/g, ", ").trim();
  const result = {
    schema: "v2" as const,
    bridge_decision: input.bridge_decision,
    underneath: plain(input.underneath),
    not_wrong_about: plain(input.not_wrong_about),
    bridge: noBridge ? "" : plain(input.bridge),
    no_bridge: noBridge
      ? {
          noticed: plain(input.no_bridge_noticed),
          let_go: plain(input.let_go),
        }
      : null,
  };

  if (verdict === "unavailable") {
    return json({ ...result, screening_unavailable: true });
  }
  return json(result);
}

// ── TWO-SIDED mediation ────────────────────────────────────────────────────

const MEDIATION_TOOL = {
  name: "provide_mediation",
  description: "Return the structured two-sided mediation for the couple.",
  input_schema: {
    type: "object",
    properties: {
      shared_ground: {
        type: "string",
        description:
          "2-3 plain sentences naming what BOTH sides show they actually care about, the thing they share underneath the clash. It must be earned from their real words on both sides, never generic, never invented. No em dashes.",
      },
      initiator_underneath: {
        type: "string",
        description:
          "The deeper emotional need underneath the initiator's side (a need, not a complaint), drawn only from the initiator's own words.",
      },
      partner_underneath: {
        type: "string",
        description:
          "The deeper emotional need underneath the partner's side (a need, not a complaint), drawn only from the partner's own words.",
      },
      initiator_bridge: {
        type: "string",
        description:
          "A warm first-person message the INITIATOR could choose to send: their own side plus one small step toward the shared ground. Lowercase, casual, 1-2 sentences, may end with a soft emoji like 🤍. No em dashes, no ghost-written apology they didn't imply.",
      },
      partner_bridge: {
        type: "string",
        description:
          "A warm first-person message the PARTNER could choose to send: their own side plus one small step toward the shared ground. Lowercase, casual, 1-2 sentences, may end with a soft emoji like 🤍. No em dashes, no ghost-written apology they didn't imply.",
      },
    },
    required: [
      "shared_ground",
      "initiator_underneath",
      "partner_underneath",
      "initiator_bridge",
      "partner_bridge",
    ],
  },
};

const MEDIATION_SYSTEM = `You are the quiet third person inside Parallax, a couples app. Both partners privately shared their real side of the same rough moment, and you are the first to see both. Help them find the middle ground.

Do:
- Find the genuinely shared ground: what both sides show they each care about. It must be earned from their actual words on BOTH sides, never invented.
- Name the real need underneath EACH side (a need, not a jab), using only that person's own words as evidence.
- Write one kind bridge for each of them: a first-person message that person could choose to send, about their own side, taking one small step toward the other. Coach the writer, never ghost-write an apology or a feeling they didn't imply.

Never:
- Decide who is right. You are not a judge and you refuse to score the argument.
- Take sides, flatter, or validate one account over the other. If one side is louder, the quieter side gets equal care.
- Attribute feelings or words that are not in what they wrote.
- Use an em dash. Use a comma, a period, "and", or "but".

Voice (this matters most):
- Sound like a perceptive friend who knows them both, not a therapist, a coach, or an AI.
- Be specific to what they ACTUALLY said. Use their real details. Nothing generic that would fit anyone.
- Short, plain sentences. Warm, not mushy. Direct, not preachy.
- Do not use these tells: "it makes sense", "it stings", "pulls away", "can feel like", "a signal that", "at the end of the day", "hold space", "showing up".

Keep every field tight. Always answer by calling the provide_mediation tool.`;

async function handleSession(req: Request, sessionId: string): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "not_configured" }, 503);

  const caller = jwtSub(req);
  if (!caller) return json({ error: "unauthenticated" }, 401);

  const sessions = await dbGet(
    `refocus_sessions?id=eq.${sessionId}&select=id,couple_id,initiator,topic,initiator_side,partner_side,state,ai_result`
  );
  if (!sessions.length) return json({ error: "session_not_found" }, 404);
  const session = sessions[0] as {
    id: string;
    couple_id: string;
    initiator: string;
    topic: string;
    initiator_side: string;
    partner_side: string | null;
    state: string;
    ai_result: unknown;
  };

  const couples = await dbGet(
    `couples?id=eq.${session.couple_id}&select=member_a,member_b`
  );
  if (!couples.length) return json({ error: "couple_not_found" }, 404);
  const { member_a, member_b } = couples[0] as {
    member_a: string | null;
    member_b: string | null;
  };
  const memberIds = [member_a, member_b].filter(Boolean) as string[];
  if (!memberIds.includes(caller)) return json({ error: "not_a_member" }, 403);

  // Idempotent: a revealed session just returns its stored result (both
  // clients call this; only the first pays for mediation).
  if (session.state === "revealed" && session.ai_result) {
    return json(session.ai_result);
  }
  if (session.state !== "ready" || !session.partner_side) {
    return json({ error: "session_not_ready", state: session.state }, 409);
  }

  if (await overRateLimit(req)) return json({ error: "rate_limited" }, 429);

  const partnerId = memberIds.find((id) => id !== session.initiator);
  const idList = memberIds.map((id) => `"${id}"`).join(",");
  const profiles = (await dbGet(
    `profiles?id=in.(${idList})&select=id,display_name`
  )) as Array<{ id: string; display_name: string | null }>;
  const nameOf = (id: string | null | undefined, fallback: string): string =>
    (id && profiles.find((p) => p.id === id)?.display_name) || fallback;
  const initiatorName = nameOf(session.initiator, "one partner");
  const partnerName = nameOf(partnerId, "the other partner");

  // Safety screening over the topic + BOTH real sides.
  const verdict = await screenForSafety([
    session.topic,
    session.initiator_side,
    session.partner_side,
  ], 'mediation');

  let result: Record<string, unknown>;
  if (verdict === "crisis") {
    console.log(JSON.stringify({ event: "refocus_escalation", mode: "mediation", type: "crisis" }));
    result = crisisResult();
  } else if (verdict === "abuse") {
    console.log(JSON.stringify({ event: "refocus_escalation", mode: "mediation", type: "abuse" }));
    result = abuseResult();
  } else if (verdict === "unavailable") {
    // FAIL-CLOSED for two-sided: return retryable 503. Both inputs are
    // required for safe mediation; we cannot proceed without screening both.
    console.log(JSON.stringify({
      event: "refocus_unavailable",
      mode: "mediation",
      session_id: sessionId,
    }));
    return json({ error: "screening_unavailable", retry: true }, 503);
  } else {
    const userMsg = `The topic, as ${initiatorName} labelled it: "${session.topic}"

${initiatorName}'s side (the initiator):
"""
${session.initiator_side}
"""

${partnerName}'s side (the partner):
"""
${session.partner_side}
"""

These are the only two accounts you have. In the tool fields, "initiator" means ${initiatorName} and "partner" means ${partnerName}. Call provide_mediation.`;

    const memory = await coupleMemoryBlock(String(session.couple_id));

    let input: Record<string, unknown> | null;
    try {
      input = await anthropicToolCall({
        model: MODEL,
        system: MEDIATION_SYSTEM + memory,
        tool: MEDIATION_TOOL,
        toolName: "provide_mediation",
        userMsg,
        maxTokens: 1024,
      });
    } catch (e) {
      if (e instanceof AnthropicError) {
        return json({ error: "anthropic_error", status: e.status, detail: e.detail }, 502);
      }
      return json({ error: "fetch_failed", detail: String(e) }, 502);
    }
    if (
      !input?.shared_ground ||
      !input?.initiator_underneath ||
      !input?.partner_underneath ||
      !input?.initiator_bridge ||
      !input?.partner_bridge
    ) {
      return json({ error: "no_mediation" }, 502);
    }
    result = { type: "mediation", ...input };
  }

  // Guarded write: only flips ready -> revealed. If a concurrent call already
  // revealed it, return the stored result so both callers see the SAME output.
  try {
    const patched = await dbPatch(
      `refocus_sessions?id=eq.${session.id}&state=eq.ready`,
      {
        ai_result: result,
        state: "revealed",
        revealed_at: new Date().toISOString(),
      }
    );
    if (!patched.length) {
      const again = await dbGet(
        `refocus_sessions?id=eq.${session.id}&select=ai_result`
      );
      const stored = again[0]?.ai_result;
      if (stored) return json(stored);
    } else if (result.type === "mediation") {
      // Only the caller that actually flipped ready -> revealed writes the
      // memory, so a concurrent second caller can't duplicate it.
      await writeBackSummary(
        String(session.id),
        String(session.topic ?? ""),
        result as Record<string, unknown>
      );
    }
  } catch (e) {
    return json({ error: "session_write_failed", detail: String(e) }, 500);
  }

  return json(result);
}

// ── Entry ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!ANTHROPIC_API_KEY) {
    // Not configured - the client shows its honest error state.
    return json({ error: "not_configured" }, 503);
  }

  let body: {
    userText?: string;
    youName?: string;
    partnerName?: string;
    sessionId?: string;
    schema?: string;
    pastedChat?: string;
    imageBase64?: string;
    mediaType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  try {
    if (typeof body.sessionId === "string" && body.sessionId.length > 0) {
      return await handleSession(req, body.sessionId);
    }
    if (body.schema === "v2") {
      return await handleSoloV2(req, body);
    }
    if (body.schema === "transcribe") {
      return await handleTranscribe(req, body);
    }
    return await handleSolo(req, body);
  } catch (e) {
    return json({ error: "internal_error", detail: String(e) }, 500);
  }
});
