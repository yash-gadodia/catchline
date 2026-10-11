// generate-drops: batch-author personalized candidate drops into the
// human-review queue (drop_candidates, migration 0019). Phase 1.4 — the
// anti-content-fatigue moat: a couple's own graph (learnings, revealed
// answers + hunch hit/miss, intents) becomes NEW drops in their rotation
// once a human approves + publishes them (publish_drop_candidate).
//
// This is an OPS/CRON endpoint, never client-called. verify_jwt is off in
// config.toml because the gate here is STRICTER than a user JWT: the bearer
// must be exactly SUPABASE_SERVICE_ROLE_KEY (anon and user JWTs are rejected).
// The ANTHROPIC_API_KEY lives only here, server-side (same as refocus).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";

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

async function dbGet(path: string): Promise<unknown[]> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) throw new Error(`db fetch failed: ${resp.status} ${path}`);
  return resp.json();
}

async function dbInsert(table: string, row: Record<string, unknown>): Promise<boolean> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  return resp.ok;
}

// ---------------------------------------------------------------------------
// Force valid output via tool use (the refocus pattern — no JSON parsing).
// ---------------------------------------------------------------------------
const THEMES = ["deeper", "fun", "spark", "daily", "memory", "spicy"] as const;

const DROPS_TOOL = {
  name: "provide_drops",
  description: "Return the batch of brand-new candidate drops.",
  input_schema: {
    type: "object",
    properties: {
      drops: {
        type: "array",
        description: "The new drops, each with exactly 3 prompts.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Lowercase drop title, 2-4 words, house style.",
            },
            theme: { type: "string", enum: [...THEMES] },
            spice: {
              type: "integer",
              minimum: 0,
              maximum: 2,
              description: "0=sweet, 1=warm/flirty, 2=spicy.",
            },
            prompts: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  emoji: { type: "string", description: "One emoji." },
                  question: {
                    type: "string",
                    description:
                      "Lowercase, first-person, about the ANSWERER's inner world, ends with '...'.",
                  },
                  options: {
                    type: "array",
                    minItems: 5,
                    maxItems: 5,
                    items: { type: "string" },
                    description: "5 concrete, distinct, guessable answers.",
                  },
                },
                required: ["emoji", "question", "options"],
              },
            },
            source_learnings: {
              type: "array",
              items: { type: "integer", minimum: 1 },
              description:
                "Numbers from the numbered love map learnings list that THIS drop genuinely grew from. Attribute sparingly — only cite a learning the drop truly digs into; empty or omitted is normal.",
            },
          },
          required: ["title", "theme", "spice", "prompts"],
        },
      },
    },
    required: ["drops"],
  },
};

// Real seed drops from migration 0015, lifted verbatim as style anchors.
const STYLE_ANCHORS = `DROP "hot takes" (theme fun, spice 0)
  🍕 "my most defendable food crime..." — pineapple on pizza / cereal for dinner / sauce on everything / cold pizza for breakfast / fries dipped in ice cream
  🎬 "the beloved thing i secretly find overrated..." — superhero movies / brunch / beach holidays / wine / big group birthday dinners
  🧠 "a hill i will absolutely die on..." — phone calls need warning texts / the middle armrest is mine / soup is not a meal / cinema popcorn counts as dinner / early is on time

DROP "the quiet stuff" (theme deeper, spice 0)
  🤫 "when i go quiet, it usually means..." — i'm processing something / i'm tired, not upset / i need a minute alone / something's on my mind / my social battery died
  🪫 "my social battery drains fastest when..." — small talk with strangers / big loud groups / being 'on' all day / people needing things from me / plans that run too long
  🌙 "what i think about when i can't sleep..." — a conversation on replay / tomorrow's list / a feeling i can't name / random 3am spirals / us, actually

DROP "the butterflies file" (theme spark, spice 1)
  🦋 "you still give me butterflies when..." — you dress up / you laugh at my joke / you find me across a crowd / you smell like you / you say my name softly
  💘 "my favourite kind of kiss..." — the slow goodbye one / forehead, i melt / the surprise mid-sentence one / the laughing-too-hard one / the 'finally home' one
  🌹 "flirt with me best by..." — teasing me / the eye contact thing / random compliments / a hand on my back in passing / remembering something tiny

DROP "after dark" (theme spicy, spice 2)
  🌙 "i feel most wanted when you..." — initiate first / say what you're thinking / can't stop looking / pull me closer half-asleep / tell me later what you liked
  🕯 "the mood that works on me..." — low light, slow music / fresh sheets, no rush / post-date-night energy / the surprise kind / hotel-room energy
  🥂 "what makes me feel irresistible..." — the way you look at me / getting dressed up / your hands finding me in passing / being told, in words / us laughing in between`;

const SYSTEM = `You author drops for Parallax, a couples app. A drop is 3 multiple-choice prompts; each partner answers for THEMSELVES and places a hunch on the other, then a reveal scores their wavelength.

The house voice (this is the whole job — match it exactly):
- Lowercase everything. Questions are first-person ("my...", "i...", "you still...") and trail off with "...".
- Every question is about the ANSWERER's inner world: their habits, feelings, memories, wants. Never trivia, never about third parties.
- Exactly 5 options per question: concrete, distinct, guessable by a partner who pays attention. No two options that mean the same thing. Options are short fragments, lowercase, no trailing periods.
- Affectionate, never ammunition. Nothing that scores, ranks, or shames a partner; nothing a couple could weaponize in a fight.
- One fitting emoji per question. NEVER use an em dash anywhere.
- Themes: deeper (inner world), fun (playful), spark (romance, spice 1), daily (routines), memory (past), spicy (intimacy, spice 2). A drop's spice is 0 unless its content is flirty (1) or intimate (2).

Style anchors, real drops from the live catalog:

${STYLE_ANCHORS}

Hard rules:
- Every drop must be NEW. Do not restate, closely paraphrase, or lightly remix any question in the AVOID list you are given.
- When you are given a couple's graph (learnings, past answers, hunch hits and misses, intents), write drops that dig into THEIR specifics: follow the threads their misses opened, go deeper where a learning points, honor their intents. Personal beats generic every time.
- If a drop genuinely grew from one or more numbered love map learnings, cite their numbers in that drop's source_learnings. Attribute sparingly — only real sources, never the whole list; most drops cite none.
- Always answer by calling the provide_drops tool.`;

// ---------------------------------------------------------------------------
// Couple-graph context
// ---------------------------------------------------------------------------
interface PromptRow {
  id: string;
  drop_id: string;
  question: string | null;
}
interface AnswerRow {
  couple_drop_id: string;
  prompt_id: string;
  author: string;
  pick: number | null;
  hunch: number | null;
}

async function coupleContext(
  coupleId: string,
): Promise<{ context: string; avoid: string[]; learningIds: string[] }> {
  const couples = (await dbGet(
    `couples?id=eq.${coupleId}&select=id,member_a,member_b,together_since`,
  )) as { member_a: string | null; member_b: string | null; together_since: string | null }[];
  if (couples.length === 0) throw new Error("couple_not_found");
  const couple = couples[0];

  const memberIds = [couple.member_a, couple.member_b].filter(Boolean) as string[];
  const profiles = (await dbGet(
    `profiles?id=in.(${memberIds.join(",")})&select=id,intents`,
  )) as { id: string; intents: string[] | null }[];
  const intents = [...new Set(profiles.flatMap((p) => p.intents ?? []))];

  const learnings = (await dbGet(
    `learnings?couple_id=eq.${coupleId}&select=id,emoji,need,detail&order=created_at.desc&limit=40`,
  )) as { id: string; emoji: string | null; need: string | null; detail: string | null }[];

  const coupleDrops = (await dbGet(
    `couple_drops?couple_id=eq.${coupleId}&state=eq.revealed&select=id,drop_id&order=date.desc&limit=30`,
  )) as { id: string; drop_id: string }[];

  let prompts: PromptRow[] = [];
  let answers: AnswerRow[] = [];
  if (coupleDrops.length > 0) {
    const dropIds = [...new Set(coupleDrops.map((cd) => cd.drop_id))];
    prompts = (await dbGet(
      `drop_prompts?drop_id=in.(${dropIds.join(",")})&select=id,drop_id,question`,
    )) as PromptRow[];
    const cdIds = coupleDrops.map((cd) => cd.id);
    answers = (await dbGet(
      `answers?couple_drop_id=in.(${cdIds.join(",")})&select=couple_drop_id,prompt_id,author,pick,hunch`,
    )) as AnswerRow[];
  }

  // Per-question hunch hit/miss across the last 30 revealed drops. A cycled
  // drop can appear twice; report each question once (most recent serving).
  const seen = new Set<string>();
  const history: string[] = [];
  const avoid: string[] = [];
  for (const cd of coupleDrops) {
    const cdAnswers = answers.filter((a) => a.couple_drop_id === cd.id);
    for (const p of prompts.filter((pr) => pr.drop_id === cd.drop_id)) {
      if (!p.question || seen.has(p.id)) continue;
      seen.add(p.id);
      avoid.push(p.question);
      const pair = cdAnswers.filter((a) => a.prompt_id === p.id);
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      const hits = (a.hunch === b.pick ? 1 : 0) + (b.hunch === a.pick ? 1 : 0);
      history.push(`"${p.question}" — hunches ${hits}/2 hit`);
    }
  }

  const lines: string[] = [];
  if (couple.together_since) lines.push(`together since: ${couple.together_since}`);
  if (intents.length > 0) lines.push(`their stated intents: ${intents.join(", ")}`);
  if (learnings.length > 0) {
    lines.push(
      "love map learnings (numbered — cite a number in a drop's source_learnings ONLY if that drop genuinely grew from it):",
      ...learnings.map(
        (l, i) =>
          `- [${i + 1}] ${`${l.emoji ?? ""} ${l.need ?? ""}${l.detail ? `: ${l.detail}` : ""}`.trim()}`,
      ),
    );
  }
  if (history.length > 0) {
    lines.push(
      "recent revealed questions with hunch accuracy (2/2 = they read each other perfectly, 0/2 = a blind spot worth exploring nearby, but never repeat the question itself):",
      ...history.slice(0, 60).map((h) => `- ${h}`),
    );
  }
  return {
    context: lines.length > 0
      ? `THE COUPLE'S GRAPH:\n${lines.join("\n")}`
      : "THE COUPLE'S GRAPH: no history yet — write warm, early-relationship drops.",
    avoid,
    learningIds: learnings.map((l) => l.id),
  };
}

async function globalContext(): Promise<{ context: string; avoid: string[]; learningIds: string[] }> {
  const drops = (await dbGet(
    `drops?position=not.is.null&select=title,theme&order=position.asc&limit=90`,
  )) as { title: string | null; theme: string | null }[];
  const themeCounts = new Map<string, number>();
  for (const d of drops) {
    const t = d.theme ?? "unknown";
    themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
  }
  const summary = [...themeCounts.entries()]
    .map(([t, n]) => `${t}: ${n}`)
    .join(", ");
  return {
    context:
      `GLOBAL CATALOG: ${drops.length} drops in rotation by theme — ${summary}. ` +
      "Author fresh drops that extend this catalog (favor under-represented themes).",
    avoid: [],
    learningIds: [],
  };
}

// A sample of catalog questions always goes in the avoid list.
async function catalogQuestionSample(): Promise<string[]> {
  const rows = (await dbGet(
    `drop_prompts?select=question&order=created_at.desc&limit=40`,
  )) as { question: string | null }[];
  return rows.map((r) => r.question).filter((q): q is string => !!q);
}

// ---------------------------------------------------------------------------
// Server-side shape validation (mirrors the 0019 check constraint)
// ---------------------------------------------------------------------------
interface CandidateDrop {
  title?: unknown;
  theme?: unknown;
  spice?: unknown;
  prompts?: unknown;
  source_learnings?: unknown;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validDrop(d: CandidateDrop): boolean {
  if (!nonEmptyString(d.title)) return false;
  if (!nonEmptyString(d.theme) || !(THEMES as readonly string[]).includes(d.theme)) return false;
  if (!Array.isArray(d.prompts) || d.prompts.length !== 3) return false;
  for (const p of d.prompts) {
    if (typeof p !== "object" || p === null) return false;
    const prompt = p as Record<string, unknown>;
    if (!nonEmptyString(prompt.emoji) || !nonEmptyString(prompt.question)) return false;
    const opts = prompt.options;
    if (!Array.isArray(opts) || opts.length !== 5) return false;
    if (!opts.every(nonEmptyString)) return false;
    if (new Set(opts.map((o) => (o as string).trim().toLowerCase())).size !== 5) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Ops gate: the bearer must BE the service-role key. Nothing else passes.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!SERVICE_ROLE_KEY || bearer !== SERVICE_ROLE_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503);

  let body: { couple_id?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const coupleId = typeof body.couple_id === "string" && body.couple_id.length > 0
    ? body.couple_id
    : null;
  if (coupleId && !/^[0-9a-f-]{36}$/i.test(coupleId)) {
    return json({ error: "invalid_couple_id" }, 400);
  }
  const count = Math.min(10, Math.max(1, Math.trunc(Number(body.count) || 3)));

  let context: string;
  let avoid: string[];
  let learningIds: string[];
  try {
    const ctx = coupleId ? await coupleContext(coupleId) : await globalContext();
    avoid = [...new Set([...ctx.avoid, ...(await catalogQuestionSample())])];
    context = ctx.context;
    learningIds = ctx.learningIds;
  } catch (e) {
    const msg = String(e);
    if (msg.includes("couple_not_found")) return json({ error: "couple_not_found" }, 404);
    return json({ error: "context_failed", detail: msg }, 502);
  }

  const userMsg = `${context}

AVOID — do not restate or closely paraphrase ANY of these existing questions:
${avoid.map((q) => `- ${q}`).join("\n") || "- (none yet)"}

Author exactly ${count} brand-new drops in the house voice. Call provide_drops.`;

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        tools: [DROPS_TOOL],
        tool_choice: { type: "tool", name: "provide_drops" },
        messages: [{ role: "user", content: userMsg }],
      }),
    });
  } catch (e) {
    return json({ error: "fetch_failed", detail: String(e) }, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return json({ error: "anthropic_error", status: resp.status, detail }, 502);
  }

  const data = await resp.json();
  const toolUse = Array.isArray(data?.content)
    ? data.content.find((c: { type?: string }) => c?.type === "tool_use")
    : null;
  const drops: CandidateDrop[] = Array.isArray(toolUse?.input?.drops)
    ? toolUse.input.drops
    : [];
  if (drops.length === 0) return json({ error: "no_drops", raw: data }, 502);

  let inserted = 0;
  let rejected = 0;
  for (const d of drops.slice(0, count)) {
    if (!validDrop(d)) {
      rejected++;
      continue;
    }
    const spice = Math.min(2, Math.max(0, Math.trunc(Number(d.spice) || 0)));
    // 1.4 flywheel: publish stamps these learnings' became_prompt_id, making
    // "now a question in your drops" literally true in the Love Map — so only
    // the learnings the model attributed THIS drop to, never the whole list.
    const sourceIds = Array.isArray(d.source_learnings)
      ? [...new Set(
        d.source_learnings
          .filter((n): n is number =>
            typeof n === "number" && Number.isInteger(n) &&
            n >= 1 && n <= learningIds.length
          )
          .map((n) => learningIds[n - 1]),
      )]
      : [];

    // Validate that all mapped UUIDs are in the couple's actual learning set.
    // Drop any that aren't (model attribution mismatch). Log a warning if any
    // were dropped to monitor for model hallucinations in attribution.
    const coupleLearningSeen = new Set(learningIds);
    const validatedIds: string[] = [];
    let droppedCount = 0;
    for (const id of sourceIds) {
      if (coupleLearningSeen.has(id)) {
        validatedIds.push(id);
      } else {
        droppedCount++;
      }
    }
    if (droppedCount > 0) {
      console.warn(
        `[generate-drops] dropped ${droppedCount} invalid source_learning UUIDs for couple ${coupleId}`,
      );
    }

    const ok = await dbInsert("drop_candidates", {
      couple_id: coupleId,
      title: (d.title as string).trim(),
      theme: d.theme,
      spice,
      prompts: d.prompts,
      source: "llm",
      status: "pending",
      source_learning_ids: validatedIds.length > 0 ? validatedIds : null,
    });
    if (ok) inserted++;
    else rejected++;
  }

  return json({ inserted, rejected });
});
