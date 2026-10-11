<!-- /autoplan restore point: ~/.gstack/projects/yash-gadodia-parallax/main-autoplan-restore-20260707-202927.md -->
# Parallax V2 — The Fight Flywheel

> **One sentence:** V2 rewires Parallax so a real-life fight reliably becomes understanding, a saved learning, a personalized next drop, and a confirmed repair — closing the loop the product was always meant to run.
>
> Status: DRAFT for review · Author: Claude (from 2026-07-07 full-product audit) · Decision owner: Yash (scope) + Dani (UX/content)

---

## 1. The problem we're solving

Couples don't break up because they fight; they break up because fights teach them nothing. The founding thesis: **use fights as the trigger to improve the relationship and learn about your partner.**

V1 does not do this. Not because the pieces are missing — because they're not connected.

## 2. Diagnosis: why V1 misses (from the 2026-07-07 audit)

The app today is three good organs with no circulatory system:

| Organ | State | Why it doesn't serve the mission |
|---|---|---|
| **Daily drop** (habit) | Strong, validated | 0 of ~270 library prompts are about conflict, repair, or needs-under-stress. The habit trains intimacy trivia, not the understanding that matters mid-fight. |
| **Refocus** (mediator) | Built, safety-screened, both modes work | A destination, not a loop. Nothing invites you in after a real fight (no nudge, no low-wavelength signal). Solo results persist **nowhere** — the insight evaporates on exit. |
| **Love Map** (memory) | Captures learnings from drops + fights | Effectively write-only. A full generation engine (`generate-drops`) exists to turn learnings into new drops — but **nothing ever invokes it** (no cron, no trigger), and the reveal never shows a woven prompt's origin. The result screen promises "Parallax will gently weave this into your next few drops" — the pipeline is parked. |

Five open joints in the intended loop:

1. **Fight → app**: no capture moment. The app doesn't know a fight happened and makes no gentle offer.
2. **Session → memory**: solo Refocus (the most common mode after a fight) persists zero server-side.
3. **Memory → habit**: learnings never actually influence which prompts surface — the generation engine exists but is never invoked, and its output waits in a review queue with no reviewer cadence.
4. **Fight → closure**: no repair check-in, no "did the bridge land?", no resolution moment. A mediated fight just... stops.
5. **Loop → identity**: no visible growth story. Wrapped/Us celebrates streaks and wavelength, never "what your rough moments taught you."

**What we are NOT wrong about:** the design decision to keep home celebration-led stands. Fights are infrequent; leading with "had a rough moment?" makes the app feel empty and pathologizing on the 27 good days a month. The daily drop earns the habit; the fight loop must ride on top of it, not replace it.

## 3. V2 thesis

> **Every fight the couple lets Parallax touch must leave the couple measurably closer: one shared understanding, one learning both can see, one prompt that follows up, one confirmed repair.**

The wavelength game stays the heartbeat. V2 makes the fight flywheel the *soul that the heartbeat serves* — rewiring existing organs, not rebuilding them.

```
        real-life fight
              │
   ①  effortless capture  (nudge in, solo or together)
              │
   ②  Refocus mediation   (exists — screened, both modes)
              │
   ③  learning saved      (Love Map — now persisted from BOTH modes)
              │
   ④  the weave           (learning → a personalized prompt in the next drops)
              │
   ⑤  repair check-in     (24h later, both answer, gated reveal — reuse the core mechanic)
              │
   ⑥  visible growth      ("2 rough moments → 5 things learned → 2 repairs")
              │
        fewer, kinder fights → back to ①
```

## 4. Feature plan

### F1 · Capture: make entering the loop effortless
**Problem:** after a fight nobody browses to a tab named Refocus.
- **Daily temperature**: the drop's play screen opens with a one-tap mood check ("how are we today?" — 4 soft options). It's skipped on any day the couple already played (never ask about the day twice), and choosing the rough option shows a quiet offer — "want to talk it through first?" — that requires an explicit tap to enter Refocus. Never auto-funnel; "not now" is always one tap. Rate-limited to once per day.
- **Partner pull-in, async not interrupt**: push when your partner starts a two-sided session, phrased for their schedule, not ours — "Dani left you something about the dishes thing, for whenever you're ready." Realtime routing already exists; the notification doesn't. If pushes are off, a pending badge on login covers it.
- **Persist solo sessions** (server-side, same RLS posture as `refocus_sessions`, pgTAP-proven before ship): the reflection survives, can be revisited, and feeds ③/④. Today it's lost on exit — the single cheapest, highest-leverage fix in this plan.
- UX: reuse `Sheet` + existing Refocus intro components; the mood check uses the same option-pill atoms as the drop itself. Zero new visual language.
- **Tone guardrail:** healthy couples must never feel interrogated. The mood check reads as a greeting, not a screening; 27-good-days-a-month couples see nothing but warmth. Dani reviews all F1 copy against "support, not judgment" with 2–3 real couples on wireframes before build.

### F2 · Repair check-in: close the emotional loop
**Problem:** mediation ends mid-air; nobody ever confirms the couple found their way back.
- 24h after a revealed two-sided session (and after a solo session where the user tapped "I'll send it" on the bridge): a quiet check-in card on Today — *"yesterday was a lot. did you two find your way back?"* Both answer privately (yes / getting there / still tender) → **server-gated mutual reveal**, exactly the mechanic the app is best at.
- "Yes" from both = a **repair** — celebrated with the same warmth as a streak milestone ("that's a repair. most couples never learn to do that."). "Still tender" from either → offer round two of Refocus, or the escalation card if the 3-in-30-days signal fires.
- **One-sided fallback (the disengaged-partner trap):** if the partner hasn't answered after 48h, the check-in resolves for the solo partner into a private **reflection note** — "what did this one teach you?" — saved to their Love Map as a private insight. Solo work is a first-class outcome, never a failed repair. At 72h the card auto-resolves as "still open" (never a silent disappearance).
- Repairs become a couple stat: quiet counter on Us, headline in Wrapped.
- Eng: `repair_checkins` table (session_id, both answers, state incl. 72h auto-resolve) + DEFINER submit fn + RLS gate mirroring `couple_drops` (pgTAP-proven before ship) + composite index on (couple_id, created_at); scheduled notification reuses the `scheduled-pushes` pattern (0022).

### F3 · The weave: fights personalize the drops
**Problem:** the promise "we'll weave this into your next few drops" is copy users see, but the pipeline behind it never fires on its own. **Most of the machinery already exists** (verified 2026-07-07): `supabase/functions/generate-drops` (446 lines) authors personalized candidate drops from the couple's graph (learnings incl. refocus, answers, hunch misses, intents) into a human-review queue (`drop_candidates`, 0019) with `publish_drop_candidate`, auto-publish for quality sources (0034), and `became_prompt_id` stamping back onto learnings. What's missing is the *trigger, the priority, and the felt moment*:
- **Trigger — event-driven, not daily-cron**: generation fires when a refocus learning is saved (with a 6h pg_cron sweep as catch-up for anything missed, deduped by a created_at window). A daily cron alone would burn 24h of the 72h budget before generation even starts, and the emotional resonance of a woven prompt decays fast.
- **Priority**: prompt the engine to weight recent fight learnings ("follow the thread the refocus opened") so the follow-up lands in the *next 2–3 drops*. Latency budget: fight → woven prompt live ≤ 72h, instrumented as a histogram with an alert on the median. Auto-publish path where the source qualifies; if a candidate sits in the review queue past 24h it surfaces in the ops runbook, not silently.
- **The felt moment**: reveal-screen provenance chip "↩ from your refocus" on woven prompts (Love Map's "became a question" card exists; the reveal — where the emotion is — shows nothing). Data is already there via `source_learning_ids`.
- **Quality gate before any of this ships (F3 go/no-go):** generate ~20 drops offline from real beta couples' learnings; blind-rate coherence/safety/tone; load-test 10 concurrent generations. Server-side schema validation on the tool-use response (reject + library fallback on any mismatch) — a bad generated prompt attributed to the couple's own fight is the single worst trust failure this product can produce. If quality fails the bar, **F3 gets cut from the release, not softened** — the flywheel (F1/F2/F4/F5) works without it.
- No new tables, no parallel weave system. This is wiring + prompt-tuning + one UI chip on an engine that's already prod-deployed, behind a kill-switch feature flag.

### F4 · Repair literacy in the daily rotation
**Problem:** the habit never trains the skill the mission needs. The soft-launch demo drop already proves the tone works ("when I'm overwhelmed, what I really need is…") — then the 90-drop library abandons it.
- Add a **repair theme** to the rotation (target ~1 repair-flavored prompt in every 4th–5th drop): fight styles, cool-down needs, what "I'm fine" means, how each of you apologizes, what makes an argument feel safe vs scary. Same playful voice, same option-pill format — this is content work (Dani's lane), not eng work.
- A **miss on a repair prompt is the product working**: the reveal frames it as tonight's conversation (existing "biggest miss" mechanic) and offers one-tap "save what you learned" to the Love Map — generalizing the capture that Refocus already has.

### F5 · Growth story: make the flywheel visible
**Problem:** the app measures showing up (streak) and guessing (wavelength) but never *growth* — the thing the mission promises.
- Us tab adds one hero line above the wavelength chart: **"things you now know about each other: 23"** (count of Love Map learnings, both sources, incl. private solo insights badged separately). Wavelength history demotes to supporting detail — this also completes the deferred "wavelength is not a report card" reframe (STRATEGY §4.3 / R3).
- Wrapped's growth card is **conditional, never a scoreboard**: couples with repairs+learnings see "2 rough moments → 5 things learned → 2 repairs"; everyone else sees the always-positive default ("you learned 5 new things about each other") — a low-conflict couple must never read "0 repairs" as a verdict on their relationship. Fights reframed as an engine of closeness, only in the couple's own data, only when the data celebrates them.
- Eng: count query needs `idx_learnings_couple_created` (composite index) before ship; counter renders a warm empty state ("your map starts with tonight's drop"), never a blank on timeout.

### Safety gate (BLOCKS F1 — not parallel work)
Screening exists and runs first (verified in `supabase/functions/refocus/index.ts`), but F1 deliberately multiplies Refocus traffic, so the audit is a **hard precondition with sign-off, not a concurrent task**:
1. **Two-sided mediation fails closed** (screener unavailable → "give us a moment, try again shortly", session stays `ready`, retry within seconds); solo reflection keeps fail-open + resources note (blocking a person mid-crisis from any reflection is worse).
2. **Full STRATEGY §4.4 checklist audit** with adversarial test cases: abuse patterns routed away from joint mediation (an abuse victim must never be funneled into "find the middle ground"), crisis copy reachable and LLM-free, anti-sycophancy (model must not validate whoever wrote more).
3. **Production safety instrumentation**: daily counts of screen passes/flags/timeouts, escalation-card fires; alert on screener timeout rate.
4. **Second-person sign-off (Yash)** on the audit results before the F1 flag turns on. No sign-off, no traffic.

## 5. What V2 explicitly does NOT do

- No home-screen redesign — Today stays celebration-led; the loop rides on existing surfaces.
- No full infinite-prompt engine (F3 is the narrow slice; the rest stays Phase 1.1).
- No voice Refocus, no therapist booking, no BTO/Money journeys (separate SG-wedge track, unchanged).
- No new tabs, no new visual language — every new surface reuses existing atoms (Sheet, option pills, Ring, reveal cards).

## 6. Sequencing — S1 is also the validation beta

The app is pre-launch (App Store review), which is a gift: **S1 ships to TestFlight beta couples behind feature flags and doubles as the validation study** the thesis needs. We don't block on a separate research phase, and we don't commit S2/S3 blind either.

| Sprint | Ships | Gate to proceed |
|---|---|---|
| **S0 — safety gate** (~1 wk, parallel with S1 build) | §4.4 audit, fail-closed mediation, safety instrumentation, Yash sign-off | Blocks F1 flag-on |
| **S1 — close the joints + measure** (~2-3 wks) | F1 (persist solo + mood-check entry + async partner notification) · F2 (repair check-in + solo fallback) · full funnel instrumentation | 2 wks of beta data: fight frequency (rough/hard days per couple/mo), capture rate, refocus completion, solo-vs-two-sided split, repair-check-in completion |
| **S2 — teach the skill** (~2 wks) | F4 (repair theme content, Dani) · F5 (growth counters, conditional Wrapped card) | Proceed if S1 shows the loop is used at all (any capture > 0 path works); tune F1 if capture rate is thin |
| **S3 — the learning moment** (~2 wks) | F3 (event-driven weave + provenance chip) | **Go/no-go on the F3 quality gate** (offline eval + load test). Quality fails → cut F3 from launch, revisit post-launch |

Decision points the beta data drives: if fight frequency < ~0.5/mo, the mood check funnel is too thin — pivot F1 toward a weekly "a moment that mattered" reflection instead of daily detection. If two-sided refocus completion < 40%, redesign before building more on top of it.

**Competitive watch (Yash):** the weave is the moat claim; if Paired ships memory-aware prompts first, pull F3's quality gate forward and reorder S2/S3. Every sprint independently shippable; app stays review-safe throughout (no core-loop regressions; all reveal gates stay RLS + pgTAP-proven; every new surface behind an OTA-toggleable flag).

## 7. Metrics (extends the D0 funnel, doesn't replace it)

No baselines exist yet (pre-launch) — S1's beta *creates* them; the targets below are initial hypotheses to be corrected by data, not commitments.

| Metric | Definition (event/table) | Initial target |
|---|---|---|
| **Conflict-engagement rate** (north-star companion) | % of couples/mo using ANY loop path: two-sided refocus, solo refocus, or reflection note — solo counts as success, not failure | ≥ 25% of active couples |
| **Repair rate** | % of two-sided refocus sessions reaching a mutual repair check-in answer (`repair_checkins` revealed) | ≥ 60% answer, ≥ 40% mutual "yes" |
| **Capture rate** | rough/hard mood picks → refocus entries (mood_check → refocus_started events) | ≥ 30% of rough picks |
| **Loop closure** | % sessions → saved learning; % fight learnings → published woven drop ≤ 72h; % woven prompts answered | 80% / 50% / ≥ library-prompt answer rate |
| **Weave quality** | closeness feedback ("did this bring you closer?") woven vs library reveals; schema-rejection rate | woven ≥ library; rejections < 5% |
| Guardrails | D0 mutual-reveal activation, streak retention, mood-check dismissal rate (tone canary — if >70% skip it, it's noise) | no regression |

Day-30 review after S1: check targets, re-sequence S2/S3 accordingly.

## 8. Risks

- **Pathologizing tone** — a couples app that keeps asking about fights feels like a hospital. Mitigations are structural, not just copy: mood check skipped on played days, rate-limited, reads as greeting; Refocus entry is explicit opt-in; notifications are async ("when you're ready"); growth card conditional; **mood-check dismissal rate instrumented as the tone canary**; Dani validates wireframes with real couples pre-build.
- **Weave quality** — a bad generated prompt lands on the most emotionally loaded material in the app. Mitigation: the F3 quality gate (offline eval + load test + go/no-go), forced tool-use schema, server-side validation with library fallback, provenance chip, rate limits, kill-switch flag.
- **One-sided usage** — one partner does the work alone. Mitigation: solo path is a first-class *outcome* (persist → private reflection note → learning → weave), counted in the north-star metric; the 48h reflection fallback means a ghosted check-in still ends in value, not a broken promise.
- **Fight frequency too low to power a loop** — unvalidated until S1's beta measures it; the S2 gate carries the pivot (weekly reflection framing instead of daily detection).
- **Competitive** — Paired could ship memory-aware prompts first; watch item with a pre-agreed response (pull F3 forward).
- **Safety surface grows** with prominence — addressed by the S0 blocking gate (fail-closed, audit, sign-off), not by parallel hardening.

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Phased S1→S3 with flags (Approach A) | Mechanical | P1,P3 | Each sprint independently validates; AI risk lands last on proven loop | Monolithic; minimal-F1/F2-only |
| 2 | CEO | Safety audit BLOCKS F1 (S0 gate + sign-off) | Mechanical | P1 | Both voices converged; pulling users into mediation without audited screening is negligent | Parallel hardening |
| 3 | CEO | F3 event-driven trigger + 6h sweep (not daily cron) | Mechanical | P3,P5 | Daily cron burns 24h of the 72h budget; resonance decays | Daily cron only |
| 4 | CEO | F3 quality gate w/ explicit cut-F3 decision point | Mechanical | P1 | Zero production data on generation quality; worst-case trust failure | Ship and tune live |
| 5 | CEO | S1 doubles as instrumented TestFlight beta | Taste→resolved | P6 | Merges voice's "validate first" with executor's "ship phased" — pre-launch status makes them the same thing | Separate 2-wk research beta blocking S1 |
| 6 | CEO | Solo path = first-class outcome (48h reflection fallback; counted in north star) | Mechanical | P1 | Disengaged partner is the #1 couples-app failure mode; a ghosted check-in must still end in value | Repair-rate-only north star |
| 7 | CEO | Tone: opt-in entry, skip-on-played, async pushes, conditional growth card, dismissal-rate canary | Mechanical | P1,P5 | "Mitigation was theater" finding accepted; made structural | Copy-only mitigation |
| 8 | CEO | F5 conditional render (never "0 repairs") | Mechanical | P1 | Low-conflict couples must not read absence of fights as failure | Cut F5 entirely |
| 9 | CEO | Eng specs E1/E2/E3 + indexes + pgTAP + flags block build-start | Mechanical | P1 | All four executor critical gaps are defensive coding, cheap now | Fix post-launch |
| 10 | CEO | Refocus-text column encryption deferred to Phase 2 | TASTE | P3 | Same data already flows through the AI path; medium-term risk | Encrypt now (adds S1 scope) |
| 11 | CEO | F3 stays in S3 (not pulled to S2 for competitive reasons) | TASTE | P3 | Quality gate before wow; competitive watch item carries the trigger to re-order | Accelerate F3 to S2 |
| 12 | CEO | Alternatives section added; R2/F4-first/solo-journal-first documented as rejected | Mechanical | P5 | Voice flagged missing tradeoff record | Leave implicit |
| 13 | Design | Mood check = inline scrolling card, never modal/full-screen; explicit two-action expand | Mechanical | P5 | Presentation determines greeting-vs-screening; both voices flagged placement as the #1 tone risk | Sheet overlay; full-screen |
| 14 | Design | "A day" = couple-local date (existing drop mechanism); server-side dedup | Mechanical | P4 | Reuse the midnight-safe primitive the codebase already has | Rolling 24h window |
| 15 | Design | One check-in per couple per day, keyed (couple_id, couple_local_date) | Mechanical | P5 | Two same-day sessions must not double-ask; check-in is about the day | Per-session check-ins |
| 16 | Design | Repair reveal reuses drop-reveal choreography scaled down; milestone-warm celebration | Mechanical | P1 | Emotional peak of the loop was unspecified — the moment must land | Minimal card reveal |
| 17 | Design | Solo fallback = in-place card transform at 48h; private insights badged + RLS author-only | Mechanical | P1 | Solo path must feel first-class, never a consolation prize | Separate screen; silent resolve |
| 18 | Design | Provenance upgraded chip → quiet full-width row with tap-to-source | TASTE | P1 | Voice: chip undersells THE story beat; executor: keep quiet. Row is the middle; founder may prefer chip | Bare chip; prominent section |
| 19 | Design | F4 deterministic hybrid distribution (every 4th drop + post-refocus boost) | Mechanical | P5 | Random cadence feels uncurated; predictability is fine here | Pure random weighting |
| 20 | Design | Us hierarchy: counter hero above Wrapped; wavelength demoted below | TASTE | P5 | Two heroes competed; growth stat wins the top per mission. Yash/Dani may prefer Wrapped first | Wrapped stays hero |
| 21 | Design | A11y specs binding (44px, roles/labels, AA contrast, reduced-motion) | Mechanical | P1 | Plan had zero a11y; table stakes | Defer to polish |
| 22 | Eng | `learnings` gets `author_id`+`is_private` migration + RLS (most security-critical item in V2) | Mechanical | P1 | Private reflection notes are impossible on today's schema; leak = trust breach | Infer privacy client-side |
| 23 | Eng | Fix pre-existing generate-drops attribution hole (validate mapped UUIDs against couple) | Mechanical | P1 | In F3's blast radius; wrong-couple attribution is a privacy bug | Leave as-is (out of diff) |
| 24 | Eng | Fix start_refocus check-then-insert race via partial unique index | Mechanical | P5 | Two simultaneous opens violate the one-open-session invariant | App-level lock |
| 25 | Eng | repair_checkins state machine formalized; 24h anchor = MAX(submitted_at) | Mechanical | P5 | Wrong anchor breaks the timer; informal states breed bugs | Anchor to reveal-compute time |
| 26 | Eng | Migrations-first build order inside S1; flags on only after pgTAP green | Mechanical | P1,P3 | Resolves voice's "blocked" vs executor's "ready" — same fact, encoded as sequence | Parallel free-for-all |

---

## GSTACK REVIEW REPORT

| Phase | Voices | Consensus | Findings → resolution |
|---|---|---|---|
| CEO (strategy/scope) | Claude executor + Claude independent [subagent-only; codex binary broken] | 2/6 outright, 4 disagreements resolved into revisions | 3 critical (validation, safety gate, F3 quality) → S0/S1-beta/F3-gate now structural |
| Design (7 dimensions) | dual Claude voices | 7/7 litmus after fixes | 6 critical specificity gaps → binding specs §10 |
| Eng (architecture/tests/perf/security) | dual Claude voices | 6/6 after fixes | 4 security/correctness items → eng gate §11; test plan artifact: `~/.gstack/projects/yash-gadodia-parallax/yash-main-test-plan-20260707.md` |
| DX | skipped — consumer app, no developer-facing scope | — | — |

26 decisions logged (22 mechanical, 4 taste). 0 user challenges: no reviewer disputed the fights-as-trigger direction.

**APPROVED by Yash, 2026-07-07 (final gate).** Taste calls resolved: plan approved as-is · provenance = quiet full-width row · Us tab hero = growth counter (Wrapped below) · F3 stays S3 with the competitive watch trigger · refocus-text encryption deferred to Phase 2. Next steps: S0 safety audit (Yash sign-off) + Dani's F1/F2 copy validation with real couples → S1 migrations foundation → S1 surfaces behind flags → TestFlight beta.

## 9. Alternatives considered (and why this sequencing won)

- **Refocus-standalone first (no capture funnel):** just polish mediation and let people find it. Rejected: discovery is the diagnosed failure — the organ works, the artery is missing.
- **F4-first (teach repair literacy before capture):** cheaper, content-only. Rejected as the *lead*: it trains vocabulary but closes no loop — nothing persists, nothing follows up. It ships in S2 regardless.
- **Monolithic V2 (everything at once):** shortest calendar, but puts generation quality on the critical path of the emotional loop and makes rollback incoherent. Rejected for phased flags.
- **Solo-journal-first (serve one-sided users before two-sided repair):** real need, but it optimizes for the failure mode instead of the mission. Folded in as F2's 48h fallback rather than the headline.
- **Empty-waiting-state fix (R2) first:** real engagement gap, smaller scope, but it improves the *game*, not the *problem the founder named*. Stays on the backlog track.

## 10. Design specs (from design review — implementer-binding)

The review found the plan mechanically specific but visually underspecified exactly where tone decides success. These are binding; an implementer should not have to guess any of them.

**F1 mood check (Today, above the drop card — never full-screen, never modal):**
- An inline card using the existing `Card` + option-pill atoms, in the Today scroll between the hero (streak/wavelength) and the drop card. It scrolls with the page — a greeting you pass, not a gate you clear.
- 4 pills, one row; exact words are Dani's call validated with 2–3 real couples pre-build (working placeholder: *golden · good · off · heavy* — day-words, not verdict-words).
- Picking a rough option expands the card in place with one line — "want to talk it through first?" — and two quiet actions: **"let's talk"** (navigates to the existing Refocus tab, the drop stays right where it was) and **"not now"** (collapses the card for the rest of the day). No X buttons, no overlays, no new navigation patterns.
- "A day" = the couple-local date already used for drops (midnight-safe); dedup key `(couple_id, couple_local_date)`, server-side.
- Answering any mood never blocks playing the drop; the card never reappears after dismissal that day.

**F2 repair check-in:**
- **One active check-in per couple per day**, keyed `(couple_id, couple_local_date)`; a second refocus reveal the same day folds into the existing check-in (it asks about the day, not the session).
- Timing: 24h after the session's `revealed_at` timestamp, surfaced at the couple's next app-open past that mark; the scheduled push respects the couple-local evening window the notification system already uses.
- Card: same visual weight as the drop card (this is a first-class daily object, not a banner) — `Card` + `Serif` title + three option pills. Copy: *"yesterday was a lot. did you two find your way back?"* → *yes / getting there / still tender*.
- Reveal: reuse the drop-reveal choreography scaled down — Ring animation + both answers side-by-side + one verdict line. Mutual "yes" gets the streak-milestone celebration treatment (sparkle + haptic + "that's a repair. most couples never learn to do that."). Never confetti-scale; warm, not carnival.
- Solo fallback at 48h: the card itself transforms (explicit, never silent) into the reflection note — one `TextInput`, prompt *"what did this one teach you?"*, saves to Love Map as a **private insight** (visible only to author, badged "just for you" in their Love Map list; excluded from partner's view via RLS `about_id`+author policy, spec'd in the eng gate).

**F3 provenance treatment (TASTE — see final gate):**
- Default: upgrade from a bare chip to a **quiet full-width row** above the woven prompt's compare card on reveal: undo-arrow icon + *"this one grew from what you learned last week"* (`Kick` label style, inkMute), tappable → opens the source learning in Love Map. Strong enough to land the story beat, quiet enough not to re-open the fight.
- Auto-publish "qualifies" is defined in code, not vibes: source acceptance history per 0034 **and** schema-valid **and** safety-screened; anything else → review queue with the 24h runbook surfacing.

**F4 distribution:** deterministic hybrid — every 4th drop contains one repair-themed prompt, and the 2 drops after any refocus reveal each boost one repair prompt to the front of selection. Couples' spice/intent settings still apply.

**F5 Us tab hierarchy (exact order):** couple avatars + name + streak → **growth counter** (GradientText hero stat, full width: "23 things you now know about each other") → Wrapped card → wavelength chart (smaller, supporting) → Love Map list. One hero stat; Wrapped keeps its card slot below it. Wrapped's growth card renders in the existing recap scroll after the streak card; when repairs+learnings are absent it renders the always-positive default (never disappears, never shows zeros).

**Remaining state transitions (binding):**
- Mood check renders with the Today scroll (no dependency on drop-card load; if the drop fails to load the greeting still shows).
- The couple never waits on the weave: a woven prompt simply *is* the next drop when ready; no polling, no "generating…" state, no notification. Stuck-in-review candidates are an ops concern (24h runbook), invisible to the couple.
- 72h check-in auto-resolve: card quietly leaves Today; the session's Love Map entry gains a "still open" note. No push, no guilt.
- Solo session where the partner never engages: no follow-up nag; the reflection note (48h) is the terminal state.
- Escalation card: existing `EscalationCard` component and 3-in-30-days trigger are unchanged; it renders after a check-in reveal where either partner said "still tender" and the counter qualifies.

**Accessibility (all new surfaces):** ≥44px touch targets (pills 56px tall), `accessibilityRole`/labels per control (mood group, check-in radio group, provenance button, counter `role="status"`), WCAG AA contrast using existing ink-on-surface tokens, reduced-motion fallbacks on Ring/sparkle.

## 11. Engineering gate — specs that block build-start (from CEO review)

Compact list; each becomes a checklist item in the sprint doc:

1. **E1** `add_learning` failure handling: no silent loss — client shows "saved locally", retries on next launch.
2. **E2** generate-drops schema validation: reject malformed tool-use output before insert; library fallback; rejection metric.
3. **E3** generation dedup: event-trigger + 6h sweep must window by `created_at`/processed-marker so a learning is never woven twice.
4. **Indexes ship with tables**: `idx_learnings_couple_created`, `idx_repair_checkins_couple_created`; verify `drop_candidates(couple_id,state)`.
5. **pgTAP before flag-on**: `repair_checkins` reveal gate + solo-persisted refocus rows (non-member and pre-reveal partner read 0 rows).
6. **Feature flags**: F1 mood check, F1 partner notify, F2 check-in, F3 weave (required kill-switch), F5 counter — all OTA-toggleable.
7. **Deploy order**: migrations → edge functions → app (flags off) → gradual flag-on; new columns/tables are ADD-only.
8. **Observability**: funnel events (mood_check, refocus_started/persisted, repair_verdict, repair_revealed, weave latency histogram, schema_error) + a "fight flywheel health" dashboard on day 1.
9. **72h auto-resolve** for check-ins is a spec'd state (`still_open`), never a silent disappearance; jest fake timers for all time-based tests.
10. **Naming**: `solo_saved_at` (not `is_persisted`); provenance row data from `source_learning_ids`.
11. **Solo-session privacy schema**: explicit `is_solo` flag on `refocus_sessions` (not inferred from NULL `partner_side`); RLS policy denies the non-author partner the row entirely — pgTAP-proven.
12. **`learnings` privacy columns (new migration)**: the table today has no author tracking — private reflection notes are impossible without `author_id uuid` + `is_private bool` and the RLS policy `(is_private AND author_id = auth.uid()) OR (NOT is_private AND couple_member)`. A partner reading a private insight ("I was selfish that day") is a trust breach and weaponizable in the next fight — this is the single most security-critical migration in V2. pgTAP-proven before flag-on.
13. **Check-in keying + state machine (formalized before the migration is written)**: `repair_checkins` unique on `(couple_id, couple_local_date)`; same-day second session folds in. States: `open → revealed` (both answered) · `open → reflection` (48h, one-sided → note prompt) · `open/reflection → still_open` (72h terminal). 24h timer anchors to `MAX(both submitted_at)`, not the edge-function completion timestamp. Transitions executed by `expire_stale_repair_checkins()` on the existing cron pattern (0021), scheduled 6-hourly.
14. **Auto-publish criteria in code**: 0034 source-quality history AND schema-valid AND safety-screened; else review queue + 24h runbook surfacing. Document that the 0034 quality ratchet only tightens upward on human review, by design.
15. **Fix existing generate-drops attribution hole**: `source_learnings` indices map by array position with no couple-ownership check — validate mapped UUIDs against the couple's actual learning IDs after mapping; reject any mismatch. (Pre-existing bug, in V2's blast radius since F3 leans on attribution.)
16. **Fix existing `start_refocus` race**: check-then-insert allows two simultaneous opens — add partial unique index `(couple_id) WHERE state IN ('waiting_partner','ready')` + ON CONFLICT handling.
17. **Mood-check persistence**: `mood_checks` table with `unique (couple_id, couple_local_date)` (dedup is the constraint, not app logic); DST-boundary pgTAP test reusing the couple-local-date primitive.
18. **Build order inside S1**: migrations foundation first (≈3–5 days: repair_checkins, mood_checks, refocus is_solo, learnings privacy, cron executors), app surfaces in parallel against local supabase, nothing flags on until pgTAP is green.
19. **F4 rotation logic location**: the every-4th-drop + post-refocus boost lives in the server-side drop-assembly path (where 0015 spice selection already runs), not the client.
