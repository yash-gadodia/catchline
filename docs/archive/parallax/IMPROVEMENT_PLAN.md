# Parallax Improvement Plan

> **The goal:** close the gap Yash felt using Paired — "properly done, fully featured, clean, intuitive, sticky" — and beat it where Parallax's wedge is genuinely stronger.
>
> **Inputs** (all in `docs/reference/`): frame-by-frame Paired catalog (`paired-screens/CATALOG.md`), brutally honest as-built audit (`audit-current-state-2026-07-02.md`), couples-app market research (`research-market-couples-apps.md`), retention-mechanics research (`research-retention-mechanics.md`). Written 2026-07-02.

---

## 1. The diagnosis in one page

**Why Paired feels "properly done":** it isn't one big feature. Every screen answers three questions at once — *what do we do today* (3-activity checklist with a green progress rail), *what did my partner just do* (avatars with checkmarks, "yash answered a quiz!" toasts, red-dot badges, turn filters), and *what have we built together* (auto-archiving Timeline). Partner color-coding (purple = you, coral = them) is consistent across every gauge and heart. Monetization is woven in at moments of delight without ever blocking the daily loop. Seven years of iteration compounded into "someone finished this."

**Why Parallax doesn't:** per the audit, it's not a polish gap — **the core loop doesn't work in production**. Every prod submit throws (unconditional `sim_partner_submit` call against a revoked RPC), falls into the offline queue, and shows a **fabricated reveal against demo answers**. Streaks never increment. There are **3 prompts of content in the entire product, repeated forever**. Refocus mediates against a hardcoded fake partner. Wrapped, widget, packs, thread, streak-freeze, and manage-sub are cosmetic demos. Nobody can pay. A fully-inactive couple receives zero outbound contact forever.

**The asymmetry that matters:** Parallax's *architecture* (server reveal gate, RLS, pgTAP coverage, pending-hold) is better engineered than it needs to be, and its *wedge* — hunch/wavelength as the core loop — is the single biggest white space the market research found ("nobody owns wavelength as identity"; guess-your-partner is TikTok's native couples format; guessing is the only mechanic where a reluctant partner's minimal effort still completes the loop for both). Paired, still seed-stage after 7 years, has **no AI, no widget, and no game-first identity**. The strategy is not "copy Paired." It's: **make the loop true, make it daily, make it sticky, then let the wavelength identity do the differentiating.**

**Order of operations (this is the plan):**

| Phase | Theme | Closes the feeling of |
|---|---|---|
| P0 | Make it TRUE | "it's broken / it's lying to me" |
| P1 | Make it DAILY | "there's nothing new tomorrow" |
| P2 | Make it TWO-PLAYER | "my partner couldn't even join" |
| P3 | Make it STICKY | "I forgot it existed" |
| P4 | Make it FEEL DONE | "it feels unfinished" |
| P5 | Make it PAY | "there's no business here" |
| P6 | Make it GROW | "nobody's ever heard of it" |

Each phase is shippable alone and ordered by dependency: retention mechanics on top of a broken loop retain nothing; monetization before stickiness monetizes nothing.

---

## 2. Product laws (evidence-backed non-negotiables)

These are permanent rules, not tasks. Every future feature gets checked against them.

1. **Never fabricate.** No fake partner data, no canned results presented as real, no unconditional "partner already played" banners, no hardcoded "83% IN SYNC". Errors say so, honestly and warmly. For an intimacy app whose wedge is trust, silent-fake-on-failure is the most dangerous pattern in the codebase. *(Audit risk #1.)*
2. **One shared couple-streak. Never comparative individual metrics.** The JMIR study of Paired documented "I'm on a streak of 27 days and he's on 2 — it gets to me" becoming relationship ammunition. Individual stats, if ever shown, stay private to their owner.
3. **Score the guess, never the bond.** "You read Dani 87% right" — never "your relationship is a 62." Near-misses are the conversation engine, not failures. Roast the round, never the relationship. *(Strategy §4.3 already agrees; reveal screen still violates it.)*
4. **Never paywall the reveal.** No successful app charges to see the partner's already-written answer; trial-expiry locking previously-revealed answers is Paired's most damaging complaint class. Free forever: daily drop → answer → hunch → reveal → score.
5. **One purchase covers both partners — enforced technically, not promised.** Billing traps are the category's loudest 1-star cluster; per-couple honesty is a trust weapon.
6. **The daily unit must be impossible to phone in.** Snapchat streaks hollowed into black-screen "roll call." A hunch requires actual thought about the other person — protect that; never add a one-tap "done."
7. **Game framing, happy-couple framing.** "Fun challenge," never "fix your issues." Deficit framing alienates the largest segment (couples who are fine). Therapy-speak is cringe to Gen-Z.
8. **No visible guilt-debt.** Unanswered days quietly archive. Never show "12 drops your partner ignored." The dyad can't diversify its counterparty; guilt kills it.
9. **Partner-triggered notifications only** (plus one streak-saver). "Dani just answered" opens at 3.4x the rate of scheduled blasts; 46% of users opt out at 2–5 generic pushes/week.
10. **Your data is yours.** Free export (already built — keep it sacred), and eventually a graceful-uncoupling flow. Post-Official-shutdown, portability is a documented buying criterion nobody else serves.

---

## 3. Phase 0 — Make it TRUE (the correctness sprint)

*Everything here is a bug fix against the audit's P0 list. No new product. This unblocks every later phase.*

- **0.1 Fix the submit path.** Remove the unconditional `sim_partner_submit` call from `submitMyAnswers` (`src/features/drops/dropActions.ts`). Sim becomes an explicit dev/demo-only branch (env-gated, marked), never reachable for a real session. Real submit: persist answers → return `coupleDropId` → `completeDrop` runs → reveal waits for the real partner. Kill the poison-pill offline duplicate.
- **0.2 Server-rehydrate today's state.** `done`/answered state comes from the DB on launch, not in-memory — relaunch must not offer replay (replays currently clobber partner answers).
- **0.3 Honest reveal.** Delete the silent `computeReveal` fallback vs demo answers. If `fetchReveal` fails: honest retry state ("can't reach your reveal — try again"). Compute + store the wavelength score server-side at reveal time (integrity now, needed for share/Wrapped/insights later).
- **0.4 Remove every fabricated signal.** The unconditional "{partner} already played today" banner (make it real — the data exists), hardcoded "▲ 9%" trend, "YASH & DANI" share footer, hardcoded ManageSub card, always-on nudge banner, dropDetail demo fallback (render the real drop from history).
- **0.5 Streaks increment for real.** `completeDrop` must actually run post-submit (falls out of 0.1); verify against prod schema. Commit the pg_cron schedule + prod RPC revocations into migrations (kill the environment drift).
- **0.6 Refocus: stop inventing the partner.** Immediate (days): reframe as explicitly **solo-side** — "untangle your side of it" — AI reflects only on what *you* wrote; delete `DANI_SIDE` injection and the silent `EXEMPLAR` fallback (errors are honest); cut the fake voice mode and fake "send to partner" until real. This keeps the surface shippable without shipping a lie. The genuine two-sided version is P4.
- **0.7 Auth dead-ends.** Resend-confirmation flow (the copy already promises it), forgot-password flow, email validation, share-sheet cancel detection, tappable retry on pairing failure.
- **0.8 Fix `COUPLE_PAIRED` analytics** (fire on actual pairing, not share-sheet open) and set the analytics key — the north-star funnel must be measurable before P1 ships.
- **0.9 Timezone-correct "today"** — key `ensure_today_drop` on couple-local midnight (couples are SGT-first), not server UTC.

**Definition of done:** two real accounts on two real devices complete answer → hunch → reveal → streak=1 against prod, with airplane-mode and relaunch tested at every step. *(This is also the TestFlight/store-review blocker list.)*

---

## 4. Phase 1 — Make it DAILY (the content engine)

*The audit's #1 product gap: day 2 = day 1 = day 365. This alone invalidates the daily-habit thesis. Also the market's #1 exploit: every incumbent dies of content exhaustion at ~6–12 months; AI-generated personalized content is the structural advantage they can't retrofit.*

- **1.1 DB-backed content catalog.** Drops live in Postgres, not `src/content/drop.ts`. Author **90 days of drops** (270 prompts) as the launch runway: mix of question types (guess-the-answer, this-or-that, rank-it, "what would they say", memory prompts), tagged by theme (fun/deep/spicy/practical) and spice level. Daily rotation per couple, no repeats, deterministic per couple-day.
- **1.2 Spice filtering server-side** and enforced in `/play` (today a "Sweet" user still gets the flirty prompt mid-flow — trust bug).
- **1.3 Intents actually tune content.** Onboarding already collects intents and promises "we'll tune your drops to it" — weight drop selection by intents. Persist the onboarding store so intents survive the quit-to-check-email path.
- **1.4 The generative engine (the moat).** Edge function: generate candidate prompts from the couple's own graph — past answers, hunch hit/miss history, Love Map learnings, together-since, intents. Human-review queue first (batch-generate → approve into catalog), fully automatic later. **This closes the flywheel the code already promises**: Love Map learnings → `became_prompt_id` → "now a question in your drops" becomes TRUE. No competitor with distribution does this.
- **1.5 The reveal is the reward — invest in it.** Per-prompt reaction (one tap, emoji) the partner sees; keep the WHY science lines; "3 hunches in a row 🔥" twin-moment escalation. The discussion about *why you guessed wrong* is the real payload (Wavelength-game insight) — end every reveal with one tappable conversation spark tied to the biggest miss.
- **1.6 One drop per day, hard cap** (Wordle law). The session ends in ~3 minutes wanting more. Extra rounds become a Plus indulgence later (P5), never the default.

---

## 5. Phase 2 — Make it TWO-PLAYER (activation)

*Paired's own retention work found churn concentrates in the first days = the second-partner window. Parallax's invite currently dead-links for anyone without the app installed.*

- **2.1 Universal links + web landing.** `https://` invite link → App/Play Store with deferred deep link, or a tiny web page: "{Name} wants to know how in-sync you two are" + store buttons + the code. This is the single highest-leverage growth fix in the codebase.
- **2.2 Pairing funnel hygiene.** Don't create orphan couples for invitees; code visible/copyable anytime from Today while pending; pending-couple reminder ("{Name} hasn't joined yet — resend?") after 24/72h; invite expiry.
- **2.3 The scripted first week (the activation gauntlet).** Duolingo: retention locks in at day 7. Script days 0–7 as a designed experience: D0 first reveal must land in session one (answer-ahead already enables this — the joiner's first session ends in a reveal, the aha moment); D1 introduce the streak in one sentence; D2 first twin-moment celebration; D3 widget-install prompt at the post-reveal peak; D7 "first week wrapped" mini-recap + streak milestone.
- **2.4 Ritual anchoring.** Notify-time step must not be skipped for solo-pending users (it currently is); reframe it as *the couple's moment* ("when do you two do this? ☕/🛏️") — JMIR's strongest sustained-use predictor — and anchor all reminders to it.
- **2.5 Instrument the funnel** end-to-end (install → signup → couple created → partner installed → partner joined → first mutual reveal). North star: **couples who completed yesterday's drop who complete today's** (couple-CURR). Second metric: **loop completions by the less-active partner.**

---

## 6. Phase 3 — Make it STICKY (the retention stack)

*As-built, nothing brings a user back tomorrow. Every trigger is gated, canned, stuck at zero, or not firing.*

- **3.1 Ship push in a build.** The wiring exists but the TestFlight build predates it. Fix the `played` heuristic (notify the *other* member, not hardcoded member_b). Add FCM for Android. Prime the permission ask right before the first partner event would fire ("want to know the moment {Name} answers?") — near-100% grant context.
- **3.2 The notification set** (partner-triggered only, per law #9):
  - "{Name} answered today's drop — place your hunch to see it 👀" *(the category's proven best trigger)*
  - "{Name} guessed your answers… she was 1 off 😅" *(reveal-shaped, about you, incomplete — Gas's CTR king, honestly used)*
  - Streak-saver ~10pm couple-local: "Your streak with {Name} ends at midnight — she already played."
  - 23.5h drift reminder anchored to the couple's ritual time. Rotate copy variants; retire winners before fatigue.
- **3.3 Nudge becomes real.** Player-initiated, rate-limited (1/day), pre-written flirty copy, **delivered as push** — currently it's an invisible in-app row, useless against the disengaged-partner problem it exists for.
- **3.4 Streak mechanics for real.** Freeze "Arm" writes `freezes_remaining` (server logic already exists!); 2 equipped max, earned free (Duolingo: 2 > 1 = +0.38% DAU; couple-level freezes are a **verified category gap** — no couples app ships them). Catch-up: yesterday's missed drop answerable for 24h at reduced score — one bad day ≠ death. Real per-day week grid from history.
- **3.5 iOS home-screen widget (real WidgetKit).** The in-app fake springboard demo becomes the real thing. States: (a) "{Name} answered — can you guess?" (urgent), (b) both done → today's wavelength + streak (celebratory), (c) neither → today's prompt teaser, (d) streak-at-risk countdown after ~8pm. Locket/Widgetable prove the home screen is THE Gen-Z couples surface; Paired doesn't have one. Promote install at the post-reveal peak (Duolingo: the install flow is the experiment).
- **3.6 Activity feed completeness** — emit the 4 event kinds that have UI but no producer (milestone, refocus, twin-moment, pack) or cut them from the UI. No dead promises.
- **3.7 Partner-silent days still pay off** (solo value as a bridge, not a destination): archive browsing ("on this day"), a solo reflection prompt, "predict {Name} against her past answers" practice round — each surface funnels back to nudge/reactivation.
- **3.8 Email re-engagement** (Resend is already the SMTP plan): if a couple is silent 3+ days, one warm email with their stats and their partner's last answer teaser. A fully-inactive couple must never again mean *zero outbound contact forever*.

---

## 7. Phase 4 — Make it FEEL DONE (the polish + coherence pass)

*This phase is the direct answer to "clean, intuitive, easy to understand." It's a hundred small decisions, done deliberately.*

- **4.1 Every screen, every state.** Audit pass over all routes: loading (skeletons, never blank white — cold start currently renders two sequential blank frames), error (retryable, honest), empty (designed, warm), unpaired/pending (Us + Refocus tabs are currently not pending-aware), partner-hasn't-answered, subscription-lapsed. A state matrix per screen, checked off. *(This is most of what "properly done" means.)*
- **4.2 A partner color system.** Paired's quiet masterstroke: you are always one color, your partner is always another, everywhere. Parallax has coral/periwinkle in play — systematize it: every avatar, gauge, heart, answer bubble, hunch chip uses the same two hues app-wide.
- **4.3 Celebration where it's earned.** Reveal-complete moment, twin moments, streak milestones, first-week — animation + haptics at the peaks (Paired: gauge draw-ins, sparkle sends; the moments users screenshot).
- **4.4 Microcopy pass.** Partner's name in every surface that touches them (Paired does this relentlessly: "Note sent to yash!"). Kill remaining report-card verdicts on the reveal (law #3). One-sentence streak rule on day 1 (Duolingo's 8-word clarification = +10K DAU).
- **4.5 Delete the dead and the fake.** Orphaned routes (`(sheets)/plus` or make it THE paywall, `gallery` out of the prod bundle); toast-only fakes either become real in their phase or the button disappears (pack send, bridge send, thread, photo change, widget ping). *A button that lies is worse than no button.*
- **4.6 Refocus v2 — genuinely two-sided (the flagship differentiator, rebuilt honest).** Session model: partner A starts → writes their side → partner B gets a gentle push ("{Name} wants to refocus something — add your side, 2 minutes") → AI mediates only when **both real sides** are in (solo mode from 0.6 stays as the fallback). Persist sessions. Before any real-user exposure, ship the safety stack STRATEGY §4.4 already calls non-negotiable: abuse/crisis screening + routing, AI disclosure, human-help signposting. Real voice input (Whisper transcription) only after text works. *(Maia validates voice mediation as the most-praised AI mechanic in the category — but it earns its way in.)*
- **4.7 Store readiness.** App icon, screenshots, hosted privacy/terms, Resend SMTP live, App Store review dry-run against the P0-fixed loop.

---

## 8. Phase 5 — Make it PAY (honest monetization)

*Rails exist in code; nothing is configured. Do this only after P0–P3 — monetizing a broken loop converts nobody and poisons reviews.*

- **5.1 Wire RevenueCat for real** (keys, products, offerings, entitlement `Parallax Pro`), route every entry to ONE paywall surface (resolve the `(sheets)/plus` vs `/checkout` split; kill the decorative card-number fields and the hardcoded ManageSub).
- **5.2 Pricing:** **$39.99/yr or $4.99/mo per couple** (already the checkout copy; undercuts Paired's $74.99, matches Flamme's fighting price) + **lifetime $79.99** ("lifetime" rhymes with the relationship promise; Agapé/Between prove the SKU). Say "one price covers you both" loudly — it's a trust weapon in a category famous for double-billing.
- **5.3 Plus sells depth, never the loop:** themed packs (spicy/deep/LDR — real ones, wired to the P1 catalog, replacing today's 3-sample-string stubs), full archive + "on this day", monthly insights, extra rounds ("one more drop tonight"), cosmetics (widget skins, reveal themes — Between/Locket prove Gen-Z pays for cosmetics without resentment). **Streak repair** after a break as a consumable (Duolingo/Snap precedent: desperation-moment willingness-to-pay; freezes stay earned-free).
- **5.4 Paywall placement:** post-reveal moment of delight (Paired's pattern), locked-pack taps, never day-0 before the first mutual reveal (55% of trial cancels are day 0), never interrupting the daily loop, and **never** locking previously-revealed history on lapse (law #4).
- **5.5 Gifting (category whitespace nobody serves):** the per-couple sub is structurally a gift ("I bought us this"). Web-checkout gift link → anniversary/Valentine's flow; onboards the cold partner with premium from day 0. Ship after the core paywall proves out.

---

## 9. Phase 6 — Make it GROW (shareability + the wavelength identity)

- **6.1 The share card (the Wordle grid of couples).** Spoiler-free weekly match/miss pattern — 🟢🟢🟡🟢🔴🟢🟢 + wavelength % + streak, pre-rendered 9:16, partner-color-coded, tiny watermark (the watermark IS the acquisition channel). Never reveals the actual Q&A — shareable without exposing intimacy. Built from the *server* score (0.3), replacing the hardcoded "YASH & DANI" card. Near-misses get the funny framing (the struggle narrative outperforms perfection in this genre).
- **6.2 Wrapped becomes real** — monthly mini + annual "Wavelength Wrapped" computed from actual couple data (drops played, hit-rate curve, most-telepathic month, archetype derived from real patterns). The artifact IS the product (Spotify's 2024 downgrade backlash) — no canned slides, ever. Couple-knowledge data is maximally identity-rich; this is the TikTok moment.
- **6.3 Aim distribution at the proven pools:** the 42.8M-post couple-quiz TikTok genre (build the demoable 5-second moment: reveal animation + share card); LDR communities (the highest-conversion segment for every incumbent — a dedicated LDR pack + time-zone-aware ritual makes it native); the free core as word-of-mouth engine (the Gottman lesson: genuinely free = the only frictionlessly recommendable app).
- **6.4 Watch for user-invented share formats and productize them** (Wordle's grid was invented by a user).
- **6.5 Later, from strength:** anonymous weekly couples league (~30 couples by consistency — Duolingo leagues drove +17% time, but it's a layer for retained couples, not activation); Android at parity (Widgetable-scale ambient demand is cross-platform); graceful-uncoupling flow (revoke access, split the archive — zero competition, real demand).

---

## 10. What NOT to build (scope discipline)

Paired's catalog is 7 years of accretion. Copying it dilutes the wedge:

- **No Stories/moods clone** — Paired's Stories, Locket's photos: crowded ambient-affection space; Parallax's ambient surface is the **widget** (3.5). Revisit only if users ask.
- **No expert directory / therapist content library** — Paired's moat, wrong fight (they have Relate presidents; you have a game). Credibility comes from the "WHY" science lines, lightly.
- **No general chat** — WhatsApp exists; Between shows "glorified messenger" is a dead end. Per-reveal reactions (1.5) + thread only if reactions prove demand.
- **No shared calendar/lists** (Cupla's lane), **no sexual-wellness content vertical** (Coral's lane — spice level in drops is enough), **no multi-relationship mode** (Agapé's dilution).
- **No "AI therapist" positioning** — Meeno pivoted out, CoupleWork can't sell at $25/mo, therapists warn against it. Refocus is a *repair ritual*, AI stays backstage.
- **No unvalidated "Connection Score" diagnosis** (Flamme's mistake) — wavelength is a game score, presented as one.
- **Kill (don't rename) the stubs that don't serve the wedge:** thread (until 1.5 proves demand), voice Refocus (until 4.6), the fake springboard demo (replaced by the real widget).

---

## 11. Feature disposition table (audit → plan)

| Audit item | Disposition |
|---|---|
| Submit/sim path (BROKEN) | **Fix now** — 0.1 |
| Fabricated signals (banner, ▲9%, Wrapped, ManageSub, share names) | **Fix now** — 0.4 (Wrapped honest-empty until 6.2) |
| Streak increments / freeze stub / week grid | **Fix** — 0.5 + 3.4 |
| 3-prompt content library | **Replace** — 1.1–1.4 |
| Refocus one-sided + no safety | **Reframe solo now** (0.6) → **two-sided + safety** (4.6) |
| Love Map (real but inert) | **Close the flywheel** — 1.4 |
| Pairing deep link dead / funnel leaks | **Fix** — 2.1–2.2 |
| Auth dead-ends (resend, forgot-pw) | **Fix now** — 0.7 |
| Push wiring (not in build, wrong member, no Android) | **Ship** — 3.1–3.2 |
| Nudge (invisible) | **Push-delivered** — 3.3 |
| Widget (fake demo) | **Real WidgetKit** — 3.5 |
| Packs (stub) | **Real, Plus-gated** — 5.3 |
| Thread (stub) | **Cut for now**; reactions first — 1.5 |
| Wrapped (canned) | **Real** — 6.2 |
| Share card (local score, hardcoded names) | **Server score + real card** — 0.3 + 6.1 |
| Checkout/ManageSub/paywall split | **One honest surface** — 5.1 |
| Activity feed (2 of 6 kinds) | **Complete or cut** — 3.6 |
| Spice mismatch in /play | **Fix** — 1.2 |
| Intents unused + lost on relaunch | **Fix + use** — 1.3 |
| Analytics (off, mis-fired event) | **Fix now** — 0.8 |
| Timezone "today" | **Fix now** — 0.9 |
| Account deletion/export (COMPLETE) | **Keep sacred** — law #10 |
| RLS/reveal-gate architecture (COMPLETE) | **Keep** — it's the foundation everything above stands on |
| Gallery/orphan routes | **Out of prod bundle** — 4.5 |

---

## 12. Metrics that decide everything

- **North star: couple-CURR** — couples who completed yesterday's drop who complete today's. (Duolingo's CURR sensitivity: 5x the DAU impact of the next-best metric.)
- **Activation:** % of created couples reaching first mutual reveal < 48h; % reaching day-7 couple-streak (the lock-in threshold).
- **The asymmetry canary:** loop completions by the less-active partner; time-to-hunch after "partner answered" push.
- **Content health:** repeat-prompt rate (must be 0 for 90 days), generative-prompt acceptance rate (1.4).
- **Trust:** billing complaint rate ≈ 0; reveal-fetch error rate; fabrication count (must be literally zero — law #1).
- All measurable only after 0.8 (analytics key + fixed `COUPLE_PAIRED`).

## 13. How this maps to "clean, intuitive, sticky, fully featured"

- **Clean** → P4 (state matrix, color system, dead-surface deletion).
- **Intuitive** → the loop explains itself: one card on Today, partner-presence everywhere (0.4 real banner, 3.1 pushes, 3.5 widget), turn-taking made visible like Paired's checkmark avatars.
- **Sticky** → P2 activation gauntlet + P3 stack (pushes, streaks with grace, widget, nudge, catch-up, email) — every mechanic evidence-backed from the retention research.
- **Fully featured** → not more features: **no obvious holes in the core loop** (P0–P1), plus the three surfaces users expect from the category leader (streaks, archive/Wrapped, packs) done honestly.
- **Solves a real problem** → the asymmetric-motivation couple (the category's unsolved killer): hunches are lower effort than authoring, nudges are push-delivered and affectionate, grace mechanics forgive real life, and the reveal makes the *other* person's inner world the reward.

*Sequencing note: P0 is one focused sprint and everything else compounds on it. P1 (content) and P2 (activation) can run in parallel after. Nothing in P5–P6 starts before P3 exists — stickiness is what monetization and growth multiply.*
