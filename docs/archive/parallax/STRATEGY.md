# Parallax — Product Strategy & Differentiation Roadmap

*Source-of-truth strategy doc. Rewritten 2026-06-29 off four deep research streams (Paired teardown · couples-app competitive landscape · SEA/Singapore market · relationship science) + a full inventory of the current app. For Yash & Dani's review.*

> **Supersedes & extends** the 2026-06-24 synthesis (preserved in git history). What's new: the central wedge is now **SEA/Singapore + Gen-Z + AI** (the prior doc's wedge was just "the hunch + wavelength," which research confirms is *table stakes* on its own). The prior doc's still-valid growth, iOS-UX, and pricing thinking is carried forward in §11–§12. Raw research evidence lives in `docs/research/2026-06-29-*.md`.

> **TL;DR.** Parallax should stop being "Paired but Gen Z" and become **the couples app built for the Singapore/SEA relationship ladder** — the BTO-flat-to-wedding-to-in-laws journey that no Western app can serve — with the **wavelength/hunch game as the daily heartbeat** and **AI as the depth layer** (infinite personalized prompts + a safe conflict mediator). The daily loop we already have is, per the science, the single strongest mechanic in the category. We don't replace it — we **elevate it from a daily game into the engine of a multi-year milestone companion**, and we win on the things Paired is structurally bad at: cultural fit, content that never runs dry, trust-first billing, and the disengaged-partner problem.

---

## 1. The opportunity in one page

**The category leader, Paired, is beatable on four structural axes:**

1. **Demographic** — Paired's average user is "a straight, early-30s millennial, 2–3 years into the relationship" ([TechCrunch](https://techcrunch.com/2021/05/27/paired-pulls-in-3-6m-to-encourage-more-couples-to-get-cosy-with-app-based-relationship-care/)). Established-millennial / married / long-distance. **Gen Z is open white space.**
2. **Geography** — Paired, Lasting, Cupla, Evergreen are all Western and **none target SEA**. The only Asia-scale couples app ever (Between, 10M+ downloads, top-10 in SG/MY/TH) went dormant after Krafton bought it in 2021. **The couples category is near-empty in SEA with no funded local incumbent.**
3. **Content depth** — Paired's #1 retention killer is that its static, expert-written library "runs out / repeats after about a year" (recurring across App Store + Reddit). A static library is a dated time-bomb. **AI-generated personalized prompts are a moat Paired can't cheaply match.**
4. **Trust** — Paired's angriest 1-stars are billing dark patterns: trial auto-charges within hours, refund refusals, hard cancellation, and "you get basically nothing" free. **A generous free core + transparent billing is itself a wedge** (and good PR).

**Why now (Singapore):** national fertility crisis is officially declared — resident **TFR hit 0.87 in 2025**, marriages −7% YoY — and the state runs a pro-marriage subsidy machine that an app sits *upstream* of. From **1 Jul 2025 there is a S$170 marriage-prep rebate** for MSF-approved providers, and Families for Life already runs a couples "Marriage Journey Quiz" (>10,500 couples) + mentoring — mechanics that map ~1:1 onto our daily-prompt + wavelength loop. That's a credible **distribution + legitimacy + funding** hook.

**Why us:** we already have the hard part built — a production-grade, server-gated drop→hunch→reveal→wavelength loop with RLS-proven privacy, Love Map, Refocus AI scaffolding, streaks-with-forgiveness, RevenueCat, 222 tests, TestFlight-ready. The gap is **product depth and differentiation, not infrastructure.**

---

## 2. Market reality (the evidence)

### 2.1 The category is fragmented, small in absolute revenue, and clusters into 6 segments

| Segment | Examples | Density |
|---|---|---|
| Daily-connection / questions | **Paired**, Lovewick, Flamme, Agapé, Evergreen | 🔴 Most crowded |
| Therapy / communication / coaching | Lasting (Talkspace), Relish, Blueheart, Gottman | 🟡 Crowded at extremes, hollow middle |
| Intimacy / "spicy" | Coral, Desire, Kindu (dead) | 🟡 Curation problem |
| Logistics / calendar / finance | Cupla, Between, Honeydue | 🟡 Commoditised by Google Cal / YNAB |
| **AI coach** | Maia (YC W24), CoupleWork, Ember, Meeno (ex-Tinder CEO) | 🟢 Newest, fastest, low-moat |
| Long-distance / presence | Between, Locket clones | 🔴 Low differentiation |

The repeated thesis across therapist reviews: *"There's no Calm for couples"* — the affordable middle between $150/session therapy and gimmicky trivia is empty.

### 2.2 The universal failure modes (every competitor hits these — they are our opening)

1. **Asymmetric / solo usage** — "the most common failure mode for couples apps." One partner disengages and the loop dies.
2. **Content runs dry** — finite libraries get exhausted and repetitive (Paired ~1yr, Honi ~3mo). BeReal is the cautionary tale: 73M→33M MAU in 7 months, "novelty without iteration."
3. **Billing dark patterns** — surprise renewals, hard cancel, forced upsell — the #1 hate theme across Paired, Lasting, Relish, Blueheart.
4. **Scorekeeping toxicity** — therapists warn that apps which *score* couples create a "transactional frame toxic to intimacy." ⚠️ **Direct constraint on our wavelength score — see §4.3.**
5. **Concept-right, execution-fatal** — Kindu had our exact double-opt-in reveal idea and died on reliability/outages. Honeydue died on bank-sync decay.

### 2.3 Singapore is the willingness-to-pay beachhead

- SG year-1 realised LTV per paying user **$22.2 — ahead of the USA ($19.9) and Australia ($21.5)**; GDP/capita ~US$90k nominal; **#1 globally in GenAI app spend per capita** (SG GenAI in-app spend US$20.9M in 2025, >2× 2024).
- Broader SEA is **engagement-rich, monetisation-thin** (day-35 download→paid 1.4% vs 2.6% NA; median annual sub ~US$18 vs ~US$36 NA) and tilts to **one-time / lifetime + e-wallets/carrier billing**, not recurring subs.
- **Implication:** anchor revenue in Singapore (and SG-like affluent cohorts — KL, Bangkok); treat the rest of SEA as a freemium/engagement funnel with PPP + lifetime pricing.

### 2.4 The Singapore cultural wedge (the structural moat)

| Hook | The reality | Why it's defensible |
|---|---|---|
| **HDB/BTO milestone ladder** | ~78–80% live in marriage-gated public housing; "Wanna BTO?" is the de facto proposal; couples enter a **3–4 yr jointly-financed sprint** (ballot → build → solemnise-within-3-months → S$30–70k reno → move-in) | A state-imposed, near-universal, multi-year relationship spine **no Western app addresses** |
| **Joint money** | #1 SG breakup driver; **1 in 4 Singaporeans** have had a relationship end over money; concrete stakes (BTO income ceilings, CPF grants up to S$120k, S$30–50k weddings) | Most-cited driver, uniquely concrete here |
| **In-laws / family** | MSF lists "poor in-law relationships" as a marital-breakdown cause; state *pays* couples to live near parents (Proximity Grant S$30k); marriage is a two-family event | Top-3 driver, **zero competitor coverage** |
| **Interfaith / interracial** | 18% of SG marriages inter-ethnic; conversion is a **legal** gate (ROMM vs civil ROM) | Defensible niche, zero coverage |
| **Language / Singlish** | Couples code-switch (Singlish, Malay *sayang*, Tamil *macha*) | Cheap, high-signal localisation Western apps never do |

*(Long-distance — 300k+ daily JB–SG causeway crossings — is real but the weakest-quantified theme: treat as a feature, not the wedge.)*

---

## 3. Differentiation thesis

> **Parallax is the couples app for the modern Asian relationship journey — Gen-Z native, AI-deep, and built around the milestones Singaporean couples actually live (the flat, the wedding, the money, the families) — with a daily "read each other's mind" game as the heartbeat.**

Three reinforcing pillars (the wedge you chose: **SEA/SG + Gen-Z + AI**):

- **Pillar A — The Asian relationship ladder** *(the moat / why we're un-clonable)*: milestone journeys, joint-money conversations, in-law/family navigation, interfaith support, local voice. This is what Paired structurally cannot build from the UK.
- **Pillar B — AI as the depth engine** *(why we don't run dry / the "aha")*: infinite personalised prompts (kills Paired's #1 churn driver), a *safe* both-input conflict mediator (Refocus), and an AI Love Map that learns the couple.
- **Pillar C — The wavelength game** *(the Gen-Z hook / our strongest validated mechanic)*: the hunch + gated reveal, reframed as celebration not scorekeeping, made social and shareable.

**The real moat is the data flywheel, not the mechanic** (the reveal mechanic is copyable in a quarter — Paired/Agapé/Flamme already have it): hunch history → AI Love Map → personalised never-repeating prompts → richer Refocus context → deeper milestone tailoring. Build the flywheel fast.

Cross-cutting wedge against Paired's wounds: **trust-first billing, a genuinely generous free core, clean fresh-start on re-pair, and design for the disengaged partner.**

---

## 4. What the science says — build on strength, avoid the traps

The relationship-science research is unusually clear about what works and what's debunked. This governs every feature decision.

### 4.1 Our core loop is the strongest thing we have — keep and reinforce it

The hunch + server-gated reveal is mechanistically a **Gottman "Love Maps" + structured-bid + perceived-partner-responsiveness engine** — the strongest, least-contested levers in the field (Joel et al. 2020, 43 datasets, ~11,196 couples: *"it's not who you're with, but the dynamic you have"* — relationship-specific perceptions dwarf traits/compatibility). The symmetric both-answer-then-reveal pattern is independently validated. The hunch also corrects **projection bias** (you stop assuming they think like you). **"Rethink the core" = elevate and reframe it, not replace it.**

Reinforce it with evidence-backed primitives:
- **Other-praising gratitude** prompts (the active ingredient is praising *them*, not generic thanks).
- **A.R.E. daily micro-check-ins** (Accessible / Responsive / Engaged — from EFT, the strongest clinical evidence base).
- **Escalating reciprocal self-disclosure** (the "36 questions" mechanism — deepen only as both answer).
- **Novelty / self-expansion** shared challenges (boredom at year 7 predicts lower satisfaction at year 16).

### 4.2 Do NOT build these (debunked or weak — saves us from obvious traps)

- ❌ **A compatibility / matching score** — partner traits & similarity explain almost nothing once perceptions are known.
- ❌ **A love-language *matching* engine** — the 2024 *Current Directions* review found none of the three love-language claims hold. Use love languages only as vocabulary/UX skin, never as a score.
- ❌ **A divorce-prediction score** — Gottman's "94%" fails cross-validation; it's postdiction, not forecast.
- ❌ **Bank-linking as a hero feature** — it's where Honeydue died (sync decay). Start with conversations + goals, not Plaid.
- ❌ **AI-as-therapist *during* the fight** — therapists call it "triangulation"; the APA issued a headwind advisory. Position AI as a coach *between* moments.

### 4.3 The wavelength-score reframe (non-negotiable design constraint)

Therapists warn that *scoring* couples is toxic, and a low number can literally start a fight. So the wavelength % must be framed as **celebration of alignment and curiosity**, never a pass/fail verdict:
- Low scores = "🔍 you surprised each other — worth a chat?" routed into a thread/Refocus, never "you failed."
- A miss feels like **discovery** ("you were 1 apart"), not a wrong answer.
- Lead with **twin moments** and what you *learned*; avoid scary absolute numbers early in a couple's life.
- Never trend the score as judgment; never imply one partner is "bad at this."

### 4.4 Refocus (AI mediator) — safety is load-bearing, not optional

The defensible AI use is **mediation from both real inputs → common ground** (the Habermas-Machine result: AI-drafted statements out-endorsed human mediators), *not* one-sided advice (which sycophancy makes worthless — the model just validates whoever is speaking). Eight requirements before Refocus ships to real users:
1. **Screen for abuse / coercive control at intake + continuously, and FAIL CLOSED** → privately route the at-risk user to DV resources. (Joint mediation is a recognised contraindication when abuse is present — an AI that "balances both sides" systematically sides with the controlling partner.)
2. **Crisis routing that BYPASSES the LLM** → surface SG helplines (SOS 1767, IMH) directly; never let a generative model improvise crisis responses. (Legal precedent: the Character.AI / Setzer settlement, Jan 2026.)
3. **Never adjudicate blame; refuse "who's right?"**
4. **De-escalation before resolution** — detect flooding, steer to a real ~20-min self-soothing timeout (a walk/breathing, *not* a chat box that lets them keep relitigating).
5. **Anti-sycophancy by design.**
6. **Persistent "I am an AI, not a therapist" disclosure.**
7. **Coach the writer; never ghost-write** (an AI-authored message, when detected, makes the partner trust you less).
8. **Grounded in the science + safety-tested before shipping.**

---

## 5. Product architecture — the reframed spine

Today Parallax is a **daily-game app**. The strategic re-frame is a **milestone-companion app whose heartbeat is the daily game**:

```
        ┌──────────────────────────────────────────────────────┐
        │   MILESTONE JOURNEYS  (the Asian relationship ladder)  │  ← the moat
        │   BTO · Wedding · Money Dates · Meet-the-Parents ·      │
        │   Two-Faiths · Moving-In                                │
        └───────────────▲───────────────────────▲────────────────┘
                        │ feeds context          │ structures content
        ┌───────────────┴───────────┐   ┌────────┴───────────────┐
        │  DAILY WAVELENGTH LOOP     │   │   REFOCUS (safe AI      │
        │  drop → hunch → reveal     │──▶│   mediator, between     │
        │  (the heartbeat, FREE)     │   │   moments)              │
        └───────────────┬────────────┘   └────────┬───────────────┘
                        │ both feed                │
                        ▼                          ▼
        ┌──────────────────────────────────────────────────────┐
        │   AI LOVE MAP  (evolving model of the couple)          │  ← powers personalisation
        │   feeds the infinite-prompt engine + journey tailoring │
        └──────────────────────────────────────────────────────┘
```

The daily loop stays **free and generous** (it's the thing that needs *both* partners — paywalling it kills two-sided activation and repeats Paired's "you get nothing" mistake). The **Journeys, AI mediation, infinite packs, and Love Map depth** are where Plus lives.

---

## 6. The phased roadmap

Each item: **what** · **why (evidence/wedge)**. North-Star metric throughout: **partner-pair activation rate** — % of invited partners who join *and* answer their first drop (nobody in the category measures this; it's our #1 leading indicator).

### Phase 0 — Foundation: trust, activation, safety, reframe *(weeks, mostly on top of what exists)*

| # | Feature | Why |
|---|---|---|
| 0.1 | **Wavelength reframe** — recopy the reveal as celebration/discovery; lead with twins & learnings, never failure | §4.3 — avoids the scorekeeping-toxicity trap latent in our headline mechanic |
| 0.2 | **Generous free core** — confirm the full daily loop (drop→hunch→reveal→Love Map) is free forever; Plus gates *depth*, not the heartbeat | Exploits Paired's "free = basically nothing"; protects two-sided activation |
| 0.3 | **Trust-first billing** — one-tap cancel, no auto-charge surprises, honest trial copy, clear renewal dates, **one billing place** (App Store via RevenueCat) | Directly attacks Paired's angriest 1-stars; word-of-mouth wedge |
| 0.4 | **Clean fresh-start on re-pair** — guarantee no ex-partner answers ever leak to a new partner | Paired's privacy landmine; we have unpair + reveal-gate, need data-scoping + a test |
| 0.5 | **Refocus safety gate** — abuse screening (fail-closed) + LLM-bypass crisis routing (SG: SOS/IMH) before Refocus is enabled for real users | §4.4 — non-negotiable before any AI mediation ships |
| 0.6 | **Disengaged-partner design** — non-nagging notifications (not dating-app-looking), inviting partner can "play ahead," frictionless join, **never collapse A's streak because B lapsed** | The category-killer churn story; we already have answer-ahead + freezes — extend it |

*(Go-live creds & infra are tracked separately in `docs/BACKLOG.md` (Yash) — not product work, but they unblock everything.)*

### Phase 1 — The wedge MVP: make Parallax distinctively Singaporean & un-clonable

| # | Feature | Why |
|---|---|---|
| 1.1 | **AI infinite-prompt engine** — Anthropic generates fresh drops calibrated to stage, spice, Love Map, and prior answers; the static seed library becomes a fallback. Track "weeks of fresh content per couple." | Kills Paired's #1 retention killer (runs dry); a moat static-content rivals can't cheaply match. Highest-leverage single build. We already have the Anthropic edge-function stack from Refocus. |
| 1.2 | **First Milestone Journey: "The BTO Journey"** — a companion for the ballot→build→keys→solemnise→reno→move-in arc: stage-aware drops, checklists, "decisions to align on" | The unique SG spine no one else has; turns a 3–4yr real-life process into 3–4yr of retention |
| 1.3 | **Money Dates module** — structured couples money conversations (not bank-linking): transparency exercises, BTO/wedding/CPF goal-setting, a recurring "money date" ritual | #1 SG breakup driver, uniquely concrete; avoids Honeydue's bank-sync death |
| 1.4 | **SG localisation layer** — Singlish/mother-tongue prompt packs, SG-specific scenarios, local endearments | Cheap, high-signal; instantly "for us" in a way Paired never is |
| 1.5 | **Inclusivity controls** — relationship-stage + faith + orientation sensitivity so content never alienates (we have spice already) | Paired alienates religious/non-Western/asexual users; table stakes for SEA |

### Phase 2 — Depth & monetisation

| # | Feature | Why |
|---|---|---|
| 2.1 | **Refocus v2 (full safe mediator)** — both-input common-ground, de-escalation-first, coach-the-writer, "Decode what they mean" only with both inputs | §4.4; the "Calm-for-couples" middle, responsibly built |
| 2.2 | **AI Love Map** — auto-synthesises an evolving model of each partner; surfaces blind spots (wrong hunches) as gentle re-prompts; powers 1.1 | Perceived responsiveness + Love Maps are top-tier levers; the personalisation moat |
| 2.3 | **More Journeys** — Meet-the-Parents/In-laws · Two Faiths, One Us (interfaith) · Wedding Planning | Top-3 drivers with zero competitor coverage |
| 2.4 | **Two-track pricing live** — SG sub (one sub covers both) + SEA PPP + **lifetime + gifting** | Matches SG WTP; fits SEA one-time/e-wallet behaviour; gifting is a proven high-margin Asian stream |
| 2.5 | **Wrapped + shareable moments** — Gen-Z social/viral layer (see §11) | Organic acquisition; Gen-Z hook |

### Phase 3 — Moat & distribution

| # | Feature | Why |
|---|---|---|
| 3.1 | **MSF / Families-for-Life partnership** — position a Journey as an approved **marriage-prep** program → state-subsidised acquisition (S$170 rebate) + legitimacy + "why now" (TFR 0.87) | Distribution + legitimacy + funding in one; the highest-value GTM follow-up *(Yash/Dani — needs the MSF "approved provider" criteria, an open research item)* |
| 3.2 | **Voice Refocus** — live voice mediation (the praised differentiator across Maia/CoupleWork/Ember) | The AI-coach wave's killer feature; deepens the moat |
| 3.3 | **Regional expansion** — KL / Bangkok affluent cohorts; e-wallet + carrier-billing payment rails | Android volume, iOS revenue; PPP pricing |
| 3.4 | **Deeper money integration** (optional bank-linking, *after* the conversation product proves out) | Only once the safe, loved version exists — never lead with sync |

---

## 7. Monetisation model

- **Free forever:** the daily wavelength loop, basic Love Map, streaks-with-forgiveness, one Journey taster. (Generous on purpose — the heartbeat needs both partners; trust is the wedge.)
- **Parallax Plus** (one subscription covers both partners — Paired proves couples love this; **per-person is fatal** — the app is worthless if only one pays): all Milestone Journeys, Refocus AI mediation, infinite personalised packs, full Love Map depth, Money Dates, Wrapped, archive.
- **Pricing (two-track):**
  - **Singapore / affluent urban:** Western tier. The prior synthesis flagged our old US annual ($39.99) as *underpriced* vs Paired ($69.99) / Evergreen ($49.99) / Flamme ($44.99), and our monthly ($4.99) as making annual only a 33% discount (category norm ~50%). **Action: A/B test annual ~S$60–80, raise monthly to ~S$8–9** so the stickier annual plan (≈2.6× more retentive) dominates. Clean 7-day trial, one-tap cancel.
  - **Broader SEA:** PPP-set manually (40–60% of Tier-1, *not* Google auto-FX), led by **lifetime + one-time + gifting**, with e-wallet / carrier-billing support.
- **Gifting:** one partner buys Plus for the couple; anniversary/occasion gifting; "send a pack." High-margin, culturally native to Asia.
- **B2B2C upside:** MSF marriage-prep rebate as a subsidised acquisition channel (Phase 3).

Anti-pattern guardrail: **never** the billing dark patterns that define Paired's 1-stars. Honest paywall + easy cancel is a feature.

---

## 8. Metrics & guardrails

- **North Star:** partner-pair activation rate (join + first answer). Instrument it first.
- **Magic moment:** two-sided D0 — both partners answer + hit their first wavelength reveal on day zero. Paired got +5% free→paid and +40% engagement just by perfecting the first core interaction. Deliver value before signup *and* before the partner arrives (a <2-min solo "reflect" round); hard-gate only the partner-answer *reveal* (the blurred empty slot is the invite motivator).
- **Retention:** benchmark against the *dating/consumer-social* floor (D1 ~26–30%, D30 ~5–6%), not utility apps; watch the curve flatten by day 14–20. Content-exhaustion is a day-one threat → 1.1 (infinite prompts) is the antidote; track "weeks of fresh content per couple."
- **Depth-of-loop:** % of couples who reach a Journey; money-date completion; Refocus resolution → Love-Map-learning conversion.
- **Trust:** refund rate, cancel friction, App Store sentiment on billing (Paired's weak spot = our scoreboard).
- **Safety (Refocus):** abuse-screen fire rate, crisis-route rate — monitored, never optimised away.

---

## 9. Risks & open questions

- **Two-sided activation is still the hardest problem in the category** — design relentlessly for the second partner; it's the North Star for a reason.
- **AI cost & safety** — infinite prompts + mediation spend Anthropic tokens; needs per-user rate limits (partly built) and the §4.4 safety stack before real-user exposure.
- **SG TAM is small in absolute terms** — the bet is high WTP + category expansion + regional funnel, not user-count. Validate WTP early.
- **Open research items (for the deck / GTM):** MSF "approved provider" eligibility criteria (highest-value follow-up); SEA couples-app sizing (no public data exists); per-country WTP for VN/TH/MY/PH.
- **Scope discipline** — this is a multi-quarter vision. Phase 0 + 1.1 + 1.2 are the proof points; everything after is earned by those landing.

---

## 10. What changes vs today, in one sentence each

- **Keep:** the drop→hunch→reveal→wavelength loop (it's the strongest mechanic in the category) — but reframe the score as celebration, not judgment.
- **Add (the moat):** Milestone Journeys around the real SG ladder (BTO, wedding, money, family, faith).
- **Add (the depth):** AI infinite prompts (never run dry) + a *safe* Refocus mediator + an AI Love Map.
- **Fix (the wedge vs Paired):** generous free core, trust-first billing, clean re-pair, disengaged-partner design, local voice.
- **Monetise:** two-track (SG sub + SEA lifetime/gifting), one sub covers both, MSF partnership upside.

---

## 11. Growth & virality (carried forward from the 2026-06-24 synthesis, ranked)

Forced partner-pairing caps the viral coefficient below 1 (`K = i×c`, invites/user ≤ 1). The escape hatch is **one-to-many sharing**, not partner invites.

1. **Wrapped / ShareCard broadcast to *friends* (#1 viral lever).** Spotify-Wrapped-style 9:16 chaptered tap-to-advance cards; numbers reframed as narrative ("finished each other's sentences 82% of the time"); couple-archetype label; pre-rendered, screenshot-first, spoiler-safe. Identity-not-brand design = 5–10× organic sharing (Duolingo).
2. **The widget IS the product (#2).** Locket hit #1 in ~10 days / 80M downloads on a home-screen widget alone — ambient, screenshottable, demoable on TikTok. Live wavelength + tap-to-ping; interactive widgets (iOS 17+). We already have an in-app widget mock to productionise.
3. **Distribution = organic founder TikTok + a "show your wavelength score" UGC challenge.** Every breakout (Locket, Gas, BeReal) grew on TikTok, not ads. Product Hunt warm-up, ASO on couple/widget keywords. *(For SG: localise the UGC angle — "our BTO wavelength," Singlish prompts.)*
4. **Forced pairing is the cleanest *activation* loop** (romantic-partner invite conversion 30–55% vs 3–5% generic) — gate the reveal on both answering. It just isn't a *growth* engine by itself.

Under-evidenced (test, don't bet): couple-archetype virality, gifting CAC, couple leaderboards.

---

## 12. iOS UX excellence (carried forward — applies across all phases)

- **Glass only in the nav/control layer** (frosted tab bar, floating CTAs), never nested; the wavelength ring is **content**, not chrome. Provide a `systemThinMaterial` / Reduce-Transparency fallback.
- **Haptics as a sparse vocabulary, always paired with a visual:** `selectionAsync` on pick, `impactAsync(Light/Medium)` on lock-in, `notificationAsync(Success)` on a matched reveal. Never on cold-start, never as the only feedback.
- **Premium speed bar:** 100ms input response, <400ms total. **Optimistic UI** on hunch submit so latency never shows.
- **The dopamine is in anticipation:** 600–900ms wavelength-ring build-up before the Reveal, then confetti + Success haptic + sound **once** on a match.
- **Prime the push prompt** (it fires once; denial is permanent): a Parallax-styled soft-ask after the first Reveal, never iOS's dialog cold.
- **Refocus is a separate, calmer mode:** self-soothe → independent NVC-framed write → AI bridge naming shared emotional themes (gently, never blaming) → resolution to the Love Map. **No confetti, no playful Peek, no celebratory haptics**, always-on crisis tripwire.
- **Anti-slop:** the dawn gradient is the recommended "sunrise" alternative to slop purple-blue; Instrument Serif + Peek + the wavelength ring are the typography/colour/motion/mascot levers that escape the templated look. Avoid red/pink heart clichés, untouched system sheets, glass beyond the nav layer.

---

*Research provenance: four parallel deep-research streams (Paired teardown, competitive landscape, SEA/Singapore market, relationship science) + full app inventory, run 2026-06-29; raw reports in `docs/research/2026-06-29-*.md`. Primary sources cited inline (SingStat, HDB, MSF/Families-for-Life, RevenueCat State of Subscription Apps, Sensor Tower, Joel et al. 2020 PNAS, Gottman Institute, EFT meta-analyses). Empirically weak/debunked claims (love-language matching, Gottman's divorce-prediction %, the "36 questions cause love" myth, compatibility scoring) are flagged in §4.2 so we don't build on sand.*
