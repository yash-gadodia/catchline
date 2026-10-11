# Parallax — Brutally Honest Product/UX/Feature Audit (as-built, 2026-07-02)

> Input to `docs/IMPROVEMENT_PLAN.md`. Produced by a full repo + Supabase-config read on 2026-07-02, at commit `7a2e6ae`.

**Repo:** `/Users/yash/parallax` · Expo SDK 56 / RN 0.85 / React 19 / Expo Router / Supabase (SG region, prod live) · last commit `7a2e6ae` (clarity-pass docs). ~340 jest tests + pgTAP suite green per docs. TestFlight build 1.0.0(5) uploaded 29 Jun (predates push wiring). App icon: none (placeholder). RevenueCat: no keys. Analytics: no key (no-op).

**One-paragraph verdict:** Parallax is a beautifully specified, heavily documented, security-conscious shell of a couples app whose single daily loop is architecturally real (RLS reveal gate, SECURITY DEFINER RPCs, realtime) but **productively empty and, as deployed, likely broken**: there are exactly **3 prompts of content in the entire product, repeated forever**; the "AI mediation" always mediates against a hardcoded fake partner script; Wrapped/widget/packs/thread/manage-sub are cosmetic demos; monetization has zero live rails; and per the repo's own GO_LIVE doc the prod revocation of the demo `sim_partner_submit` RPC combined with the client's unconditional call to it means **every real production submit throws and falls into the offline-fallback path, showing a fabricated reveal and never incrementing the streak**. The docs (STRATEGY.md, COMPETITIVE_PAIRED.md) already diagnose most of this with unusual honesty — the gap between the strategy docs and the shipped bits is the audit's core finding.

---

## (a) Feature inventory with maturity ratings

Legend: **COMPLETE** (works end-to-end for real users) · **PARTIAL** (real backend/UI but material gaps) · **STUB** (UI exists, no real backend effect) · **MISSING** (referenced in docs/UI, does not exist) · **BROKEN** (implemented but defective in the shipped configuration).

| # | Feature | Rating | Evidence |
|---|---|---|---|
| 1 | Email/password auth + email confirmation deep-link | **PARTIAL** | Works (Resend prod SMTP still unset; Mailpit local). **No resend-confirmation flow exists anywhere** — yet `auth-callback.tsx` error copy promises "Sign in to send a fresh one" (false). No forgot-password flow at all. No email format validation. |
| 2 | Apple / Google sign-in | **PARTIAL** | Providers enabled on prod Supabase (29 Jun). Google PKCE flow real (handles user-cancel correctly). Apple needs dev build; throws a labeled gate error in Expo Go. |
| 3 | Onboarding (6 steps: welcome→how-it-works→intents→pair-up→joined→notify-time) | **PARTIAL** | All screens built, copy polished. Intents can silently vanish on the common quit-app-to-check-email path (`useOnboardingStore` has no persistence; `flushPendingIntents` no-ops on empty). Intents stored in `profiles.intents` but **never used to tune content** despite the promise "We'll tune your drops to it". Notify-time step skipped entirely for the solo/pending path (they exit at step 4). |
| 4 | Pairing (invite code, deep link, join, realtime flip) | **PARTIAL** | RPCs solid (`create_couple`/`join_couple`, code `XXXX-1234`). But: invite deep link is `parallax://` only — **dead link for a partner without the app installed** (universal-links = explicit TODO); "Tap retry" on code-creation failure **is not tappable** (plain Text, no onPress); share-sheet cancel isn't checked so canceling still advances + fires `COUPLE_PAIRED` analytics; invitee arriving via join-link also silently creates an orphan pending couple on mount; no way to view/copy your code after onboarding; pending couples never expire, no reminder to the inviter. |
| 5 | Solo answer-ahead while pending ("pending holds reveal") | **COMPLETE (server) / PARTIAL (UX)** | Migration 0011 correctly holds reveal while `status='pending'` and releases on `dissolved` (pgTAP-proven). UX: Today shows "answers in · held 🔒" — good — but Us/Refocus tabs are not pending-aware, and no stale-held-drop handling if partner joins days later. |
| 6 | Daily drop → play → submit → server reveal gate | **BROKEN (prod, per repo config docs) / PARTIAL (local)** | The gate itself is genuinely server-enforced (RLS `answers_select_partner_revealed`, pgTAP with role impersonation — best-engineered part of the app). BUT `submitMyAnswers` **unconditionally** calls `sim_partner_submit` and `throw`s on its error. GO_LIVE.md records EXECUTE on that RPC revoked from `authenticated`/`anon` on prod → on prod every submit: answers persist → sim RPC fails → throw → play.tsx catch → **enqueues a duplicate submit in the offline queue + toasts "We'll send your answers when you're back online"** → `done:true` **without `coupleDropId`** → `/waiting` falls to the demo timeout → `/reveal` computes a **local fake reveal against hardcoded "Remy" demo answers**. `completeDrop` (streak increment) is after the throw → **streaks never increment in prod**. `revealed` push never fires. The queued duplicate retries (and re-fails) every launch. |
| 7 | Content library | **STUB — the #1 product gap** | Exactly **one drop, 3 prompts** exists in both the client (`src/content/drop.ts`) and the DB (single seeded drop `DROP 27`, fixed UUID; `ensure_today_drop()` points every couple's every day at it). Day 2 = day 1 = day 365. The Us "archive" (DROP 26/25/24), thread conversation, learnings samples are all fabricated demo arrays. Docs (COMPETITIVE_PAIRED Gap A, STRATEGY 1.1) fully acknowledge this; nothing has shipped against it. |
| 8 | Wavelength scoring | **PARTIAL** | Pure client-side math (`scoreReveal`: hits/(prompts×2)); server never computes or stores a score (`couple_history` RPC recomputes for history). Also unreformed vs the strategy's own §4.3 non-negotiable "celebration not scorekeeping" — reveal still headlines the % with verdicts ("A little blurry"). |
| 9 | Reveal screen | **PARTIAL/BROKEN in prod** | Real `fetchReveal` path exists and is correct when it runs; any error silently falls back to `computeReveal(playState)` which substitutes hardcoded demo partner answers — a real couple can be shown a fabricated reveal with no indication. |
| 10 | Sim/demo mode (solo "Dani") | **PARTIAL + LEAKY** | Intent: solo testability. Leaks: (i) client calls it unconditionally with no guard — locally, a *pending* real user who plays gets a **permanent fake partner "Dani" assigned as member_b and status flipped to active, locking their real partner's invite out forever** (`join_couple` rejects non-pending); (ii) two demo personas coexist confusingly ("Dani" in DB sim, "Remy" in client content). |
| 11 | Refocus (AI mediation) | **PARTIAL — one-sided by design flaw** | Edge fn is real, deployed, Anthropic key live, `verify_jwt=true`, 12/hr/user rate limit (fails open). Claude Haiku 4.5, forced tool-use, good voice prompt. BUT: **the partner's side is always the hardcoded `DANI_SIDE` script** — no partner-turn flow, no session persistence, no partner notification. The AI invents "their side" and attributes it to the real partner's name. Voice mode = fake waveform + canned transcript. "Send to partner" bridge = local `setSent(true)` toast, message goes nowhere. Any error → silent fallback to the identical canned `EXEMPLAR` result with zero disclosure. **None of the strategy's 8 safety requirements (abuse screening, crisis routing, etc.) exist in code.** Learnings→Love Map write is real and deduped. |
| 12 | Love Map | **PARTIAL** | Real `learnings` table, `add_learning` idempotent, real reveal→learning derivation (`persistDropLearning`), correct honest empty states, sample data only when unauthenticated. But `became_prompt_id`/"now a question in your drops" UI has **no producer** — learnings never feed back into content (the entire "parallax loop"/flywheel promise is unimplemented). Mastery meter values are static. |
| 13 | Streaks | **PARTIAL (server) / BROKEN (prod increments) / STUB (freeze UI)** | Server: gap-aware `complete_streak` + `reset_stale_streaks()` with freeze forgiveness, pgTAP-proven, pg_cron scheduled on prod (00:00 SGT; cron lives only in prod dashboard, not in a committed migration). Client: increment call sits **after** the always-throwing sim call → never runs in prod. Streak-freeze "Arm" button is pure local `useState` + toast — never touches `freezes_remaining`. Week grid is `Math.min(streak,7)` fill, not real per-day history. |
| 14 | Activity feed | **PARTIAL** | Real table + realtime + `mark_activity_read`. But only `played` and `nudge` kinds are ever written; `milestone`/`pack`/`refocus`/`reveal` (twin moment) kinds have full copy + UI and **can never appear** for a real couple. |
| 15 | Nudge partner | **PARTIAL** | Real RPC writes an activity row. **No push/email attached** — invisible unless the partner opens the app (useless against the disengaged-partner problem it exists for). Profile's nudge banner shows unconditionally regardless of actual state. |
| 16 | Push notifications | **PARTIAL (gated + not in shipped build)** | Real end-to-end wiring: `registerPushToken` → `profiles.push_token` → deployed `notify-partner` edge fn → Expo push for `paired`/`played`/`revealed`. Gaps: current TestFlight build predates client wiring; Android FCM key missing; `played` event can't identify the submitter (hardcoded "notify member_b" heuristic — wrong half the time); **no nudge push**; **no server-scheduled reminder of any kind** — only a local device notification, opt-in, on the device of someone who already uses the app. A couple where neither partner opens the app receives **zero outbound contact forever** (no email re-engagement exists at all). |
| 17 | Packs (themed drops) | **STUB** | 4 static packs, 3 locked behind Plus. Lock gating by `isPro` real; content is 3 sample strings per pack; `drops.pack_id` never populated; **"Send drop to partner" is a toast + navigate-back with zero backend call**. |
| 18 | Thread (per-answer chat) | **STUB** | Local component state only; nothing persisted, nothing delivered. Demo thread scripted ("Remy"). |
| 19 | Wrapped (monthly recap) | **STUB** | 100% hardcoded slides: "28 drops", "38 twin moments", archetype "The Slow Burn", share card literally says **"83% IN SYNC" for every couple**. No Supabase query in the file. |
| 20 | Milestones | **PARTIAL** | Real trigger (`days` from real streak — stuck at 0 in prod), static per-threshold copy, share works. |
| 21 | Home-screen widget | **STUB** | No WidgetKit/App-Widget native code exists anywhere. `widgetSetup` + `homeScreen` are an in-app fake iOS springboard (hardcoded "9:41", "Sunday, June 8", `Ring pct={83}`). Strategy doc calls the widget "#2 viral lever" — largest ambition-vs-reality gap. |
| 22 | Share sheet (reveal/milestone/wrapped) | **PARTIAL** | Real OS share + clipboard. Uses **local** `computeReveal(playState)` (not server data) for the number, and the share-card footer hardcodes **"YASH & DANI"** for every couple. |
| 23 | Spice level | **PARTIAL** | Persists to `profiles.spice_level`, genuinely filters shown prompts — but only on the Today card; `/play` reads unfiltered `DROP.prompts`, so a "Sweet" user still gets the flirty prompt during play. Filters the static client DROP, not DB `drop_prompts`. |
| 24 | Profile / settings / edit profile | **PARTIAL** | Real: name, together-since, notify time, log out, unpair, restore purchases, data export, full App-Store-grade account deletion (edge fn + `auth.admin.deleteUser` — genuinely complete). Stub: "Change photo" (toast only). |
| 25 | Monetization (RevenueCat "Parallax Pro") | **STUB in practice** | See (e). No keys, no products, no pricing → `purchasesAvailable()` false in every build incl. TestFlight → all purchases are a local demo flag. Paywall sheet route is dead code. |
| 26 | Offline submit queue | **PARTIAL** | Real AsyncStorage queue, flush on launch only (not on reconnect). In prod it becomes a poison-pill duplicate-submit loop (see #6). |
| 27 | Analytics | **PARTIAL (wired, disabled)** | Hand-rolled PostHog-compatible client, 9+ funnel events wired incl. error boundary; no-ops without `EXPO_PUBLIC_ANALYTICS_KEY` (unset). North-star metric (partner-pair activation) unmeasurable today; `COUPLE_PAIRED` fires on share-sheet *open*, not actual pairing — would corrupt the funnel even when enabled. |
| 28 | Account deletion / data export | **COMPLETE** | `delete_my_account()` RPC + `delete-account` edge fn (deployed, JWT-gated) + export sheet. |
| 29 | Security backbone (RLS + DEFINER RPCs) | **COMPLETE** | Every cross-partner write via DEFINER RPC with membership guards; reveal gate + pending-hold + partner-profile RLS all pgTAP-proven. The 0013 story (everyone's partner showed as "Dani" for weeks due to an RLS name-shadowing bug) shows both the risk and that it's now tested. |
| 30 | Milestone Journeys / Money Dates / SG localization / AI infinite prompts / AI Love Map (STRATEGY Phases 1–2) | **MISSING** | Zero code. Strategy-only. |
| 31 | Gallery (`/gallery`) | Dev-only orphan | Component storybook, unreachable; ships in the bundle. |

---

## (b) Screen-by-screen journey map

### Entry & gating
- **`/` (index)** — pure router. `session && status∈{active,pending}` → Today; else → onboarding. Loading = `return null` → **blank white frame** (stacked on `_layout`'s fonts-loading `null` — two sequential blank frames on cold start; no splash/skeleton). A `useCouple` fetch *error* is indistinguishable from "no couple" → errored users silently dumped into onboarding.
- **`_layout`** — providers, RevenueCat configure (no-op w/o keys), analytics init (no-op w/o key), offline-queue flush (launch only), push-token registration on SIGNED_IN.

### Onboarding `(onboarding)/index.tsx` (single-file 6-step machine; back-chevron only nav)
1. **Welcome** — "mind the parallax error"; → "Get started (takes a minute)" / "I already have an account" → `/login`.
2. **How it works** — "Three taps, then the good part." Answer honestly / Call their answer / Come into focus.
3. **Intents** — "What do you two want?" 5 chips; no session → pushed to `/signup`; intents stashed in non-persisted store (data-loss path); **never used downstream**.
4. **Pair up** — "It takes two." Creates couple on mount (even for invitees → orphan couples). Share = OS sheet with `parallax://join?code=…` (dead for non-installed recipients). "Tap retry" not tappable on failure. Share cancel still advances + logs `COUPLE_PAIRED`. "Enter a code instead" → join input.
5. **Joined** — pending: "Answer today's drop now — they'll see your hunches the moment they join." → exits to Today (**skips notify-time step**). Active (realtime flip): "🎉 {partner} joined!" → step 6.
6. **Notify time** — "When's your moment?" 4 time chips; schedules a **local** daily notification + saves `notify_time`; all failures swallowed; "Not now" skips.

### Auth
- **`/signup`** — name/email/password (6-char min, no confirm, no email validation) + Apple/Google. Post-submit: "Check your inbox…" **No resend. Dead end if email lost/typo'd.**
- **`/login`** — email/password + Apple/Google. **No forgot-password.**
- **`/auth-callback`** — error copy promises a resend flow the app doesn't have.
- **`/join`** — invisible deep-link handler; malformed code → silent normal onboarding, no message.

### Core loop
- **Today `(tabs)/today`** — streak pill (0 forever in prod), activity bell, avatar. States: not-done → drop card + banner **"{partner} already played today · your turn, no peeking" shown unconditionally — a fabricated claim**; pending → answer-ahead + "held 🔒"; done → "{wave}% on the same wavelength". Also "Send {partner} a pack" row. No loading/error states. `done` is in-memory only → **relaunch = "Play today's three" again** (replay re-clobbers partner answers where sim executable). Spice-filtered tiles here vs unfiltered play flow mismatch. No countdown/tomorrow messaging after completion.
- **Play `/play`** — pick (coral) → hunch (periwinkle) ×3. On error: offline enqueue + misleading "back online" toast (also the path every prod submit takes).
- **Waiting `/waiting`** — realtime on `couple_drops.state`; demo path = 2.6s timeout. Back allowed.
- **Reveal `/reveal`** — ring animates to %, verdicts, twin badges, hunch ✓/✗, "WHY" science lines, thread links, share, "Done for today". `fetchReveal` real; **any error → silent local fake reveal vs "Remy" demo answers**. Score client-computed; framing still report-card style (own strategy §4.3 flags as non-negotiable to fix).
- **Thread `/thread`** — UI-only chat, nothing persisted; scripted demo convo.
- **DropDetail `/dropDetail`** — looks up static `ARCHIVE` only; real history codes never match → **silently renders the wrong (demo) drop**.

### Refocus `(tabs)/refocus` (full-screen)
intro → mode (Type / Voice[fake recorder+canned transcript] / Paste[pre-filled scripted fight]) → share ("Only the AI reads this") → waiting (4.2s min) → result (agree/angles/underneath/way-back/editable bridge ["send" is fake]/Love-Map write [real]/therapy disclaimer). Partner's side always `DANI_SIDE`; failures silently return `EXEMPLAR`. No abuse/crisis safety layer.

### Us cluster
- **Us `(tabs)/us`** — header, Wrapped hero, Love Map preview, wavelength chart (real history; honest empty state) — but trend delta is a **hardcoded "▲ 9%"**; drop history emoji lookup always misses → 💬.
- **LoveMap `/lovemap`** — real learnings, provenance badges, mastery meter (static values), "now a question in your drops" (never true), honest empty state.
- **Wrapped `/wrapped`** — fully canned; "83% IN SYNC" share card for everyone.
- **Streak `/streak`** — real streak value; decorative freeze "Arm"; synthetic week grid; milestones.
- **Activity `/activity`** — real feed (played/nudge only); empty state promises milestones that can't fire.

### Settings / growth / pay
- **Profile** — identity, always-on nudge banner, notifications row, spice sheet, widget setup, replay intro, Plus row, export/logout/unpair/delete.
- **EditProfile** — name + together-since real; photo change is a toast.
- **WidgetSetup → HomeScreen** — fake springboard demo (no native widget).
- **Packs → PackDetail** — gated by `isPro`; "Try Plus" **mis-routes to `/manageSub`** where a free user sees a hardcoded "● active · free trial / ANNUAL" card; "Send drop" is a toast.
- **Checkout `/checkout`** — $39.99/yr / $4.99/mo; Apple Pay/Card toggle (card fields decorative); real RC call iff offering exists, else demo unlock.
- **ManageSub** — **hardcoded plan/trial/renewal ("Jun 15, 2026") regardless of reality**.
- **Sheets:** `share` (real OS share; hardcoded "YASH & DANI" footer), `spice` (real), **`plus` (orphaned — the "official" paywall sheet is dead code)**, `gallery` (orphaned dev storybook).

---

## (c) Gaps, broken & missing pieces (ranked)

**P0 — correctness of the core loop in production**
1. **Unconditional `sim_partner_submit` + `throw simError`** (`src/features/drops/dropActions.ts`): with prod EXECUTE revoked (GO_LIVE.md §7), every prod submit → error → offline-queue duplicate + misleading toast → `done` without `coupleDropId` → demo waiting → **fabricated local reveal vs "Remy" answers** → `completeDrop` never runs (**streak permanently 0**) → `revealed` push never fires → queued duplicate re-fails every launch. Where the RPC *is* executable (local/demo): a pending real user who plays gets a **permanent fake "Dani" partner and their real partner's invite is bricked**; replays clobber a real partner's answers.
2. **`done` not server-rehydrated** — relaunch resets the day; replay + re-clobber.
3. **Refocus is structurally one-sided** — the flagship differentiator never collects the partner's side; AI output about the partner is invented; failures silently show the same canned result. Ships with **zero** of the safety stack STRATEGY §4.4 calls "non-negotiable before real users".

**P1 — the product is a 1-day product**
4. **3 prompts total, forever** (client + single seeded DB drop; `ensure_today_drop` fixed UUID). No rotation, no catalog, no AI generation, no "content finished" state. This alone invalidates a daily-habit thesis.
5. **Fabricated signals shown to real couples**: unconditional "{partner} already played today" banner; hardcoded "▲ 9%"; Wrapped "83% IN SYNC"/"The Slow Burn"; hardcoded ManageSub status; share card "YASH & DANI"; dropDetail demo fallback; nudge banner always on.
6. **Learnings→prompts flywheel absent** — the Love Map "becomes a question" promise has no producer; intents captured but unused; hunch history unused. The strategy's "real moat is the data flywheel" is 0% built.

**P2 — activation/viral loop leaks**
7. Invite link dead for non-installed partners (no universal links, no store fallback, no web landing).
8. "Tap retry" not tappable; share-cancel counted as pairing; orphan couples for invitees; no code-copy affordance; no pending expiry/reminders.
9. No resend-confirmation email; no forgot-password; auth-callback copy promises a flow that doesn't exist.
10. Intents lost on cold relaunch (non-persisted store).

**P3 — retention infrastructure**
11. No server-scheduled reminders of any kind; only opt-in local notification on the already-engaged device. **A fully-inactive couple gets zero outbound contact forever.** No re-engagement email. Nudge has no push. `played` push notifies the wrong member half the time. Push delivery not in the shipped TestFlight build; Android FCM missing.
12. Activity feed can only ever show 2 of 6 event kinds.
13. Offline flush only on launch, not reconnect.

**P4 — dead/deceptive surfaces**
14. Orphaned routes: `(sheets)/plus` (the actual paywall sheet), `gallery`.
15. Toast-only fakes: pack send, bridge send, thread messages, streak freeze arm, photo change, widget "ping".
16. Packs "Try Plus" mis-routes free users to a hardcoded-"active" ManageSub.

**Doc-vs-code deltas:** BACKLOG says streak cron unscheduled — GO_LIVE (newer) says pg_cron wired on prod (dashboard only, not committed); config.toml comments say `verify_jwt` off — actual values `true` (stale comments); FLOWS.md says Refocus "each partner privately writes their side" — untrue as built; README "full loop works end-to-end" true only for the solo demo.

---

## (d) Stickiness / habit-loop assessment

**What brings a user back tomorrow, as-built: essentially nothing.**
- **Trigger:** only an opt-in *local* notification on the device of someone already active; notify-time step skipped for solo-pending users (most new users). Partner-event pushes wired but not in the shipped build; no server reminders; no email; no widget.
- **Variable reward:** the reveal — but tomorrow it's the *same 3 questions*; day 2's reveal is deterministic and dead. Novelty runway: **1 day**.
- **Investment:** Love Map accrues real rows but never changes anything the user experiences; streak stuck at 0 in prod, so the loss-aversion mechanic (freeze, milestones) is inert; Wrapped/archetype don't reflect the couple.
- **Inactive-partner story (the category's #1 killer):** answer-ahead + held reveal is genuinely good server design, but the inviter's only lever is a silent in-app nudge row; the absent partner receives literally nothing (no push token, no email, dead deep link if uninstalled).
- **Day 2:** same questions; likely still an error-toast submit; streak still 0. **Day 7:** nothing new has ever appeared. **Day 30:** identical, plus "monthly wrapped" would show fake numbers. Retention curve as-built ≈ novelty decay with no floor.
- The design intent (streaks+freeze, time-anchored nudges, activity red-dot, milestones, widget, Wrapped) is a competent Duolingo/Locket-style habit stack **on paper**; every single trigger in it is currently gated, canned, stuck at zero, or not firing.

## (e) Monetization state

- **Rails:** `react-native-purchases` + `purchases-ui` integrated correctly in code (entitlement "Parallax Pro", Expo Go-safe). **No RevenueCat API keys, no products, no pricing configured** → `purchasesAvailable()` false in every build → every purchase/cancel/restore is a local demo flag. Nobody can pay real money today.
- **Paywall surfaces:** the designed paywall sheet `(sheets)/plus` is unreachable dead code; all entries go to custom `/checkout` ($39.99/yr / $4.99/mo, 7-day trial copy) whose "Card" method is decorative. ManageSub lies (hardcoded ANNUAL/trial/"Jun 15, 2026") even for free users.
- **Value behind the paywall today:** 3 locked packs whose "send" does nothing, "unlimited drops" (no such mechanic), "full wavelength history" (no cap implemented — free users already keep everything), "streak freezes" (decorative). **Plus currently sells four things that either don't exist or are already free.**
- **Trigger points:** paywall only reachable by deliberate navigation — never triggered contextually in the core loop (no post-reveal upsell), consistent with the "generous free core" strategy but currently moot.
- **Pricing posture vs docs:** checkout's $39.99/$4.99 matches COMPETITIVE_PAIRED's "cheaper than Paired" stance; STRATEGY §7 wants A/B ~S$60–80 annual, SEA/lifetime/gifting tracks — none in code.

## (f) Product-level risks

1. **Trust erosion by fabrication** — the app repeatedly presents fake data as real (partner-played banner, fake reveal fallback, canned Refocus result, Wrapped, ManageSub, ▲9%). For an intimacy product whose wedge is explicitly "trust-first", silent-fake-on-failure is the most dangerous pattern in the codebase.
2. **Refocus liability** — a live Anthropic-powered mediation surface with the partner's side invented, no abuse/crisis screening, and a canned fallback indistinguishable from real analysis.
3. **Wavelength integrity** — score computed client-side; matters once sharing/leaderboards/Wrapped go real.
4. **Ops invisibility** — analytics key unset + `COUPLE_PAIRED` mis-fired on share-open: the declared North Star (partner-pair activation) is unmeasurable and would be wrong once enabled; prod pg_cron and RPC revocations live only in the dashboard (environment drift risk).
5. **Timezone** — `ensure_today_drop` keys on server `current_date` (UTC-ish), not couple-local midnight; "today" flips at 8am SGT.
6. **Store readiness** — no app icon, no screenshots, privacy/terms unhosted, Resend SMTP unset; a reviewer would hit the broken prod submit path.

**Bottom line vs competitors:** Parallax's differentiators on paper — hunch mechanic, server reveal gate, Refocus repair, Love Map memory — are exactly the right wedge per its own research docs, and the security/data architecture is genuinely above-par. But versus any shipped competitor it currently loses on every table stake: content depth (3 vs 1,000+ prompts), a working two-player loop in prod, real notifications, real monetization, honest data, and any retention mechanic that functions. Fastest path to a comparable product: fix the submit/sim P0, build the content pipeline, make Refocus genuinely two-sided or reposition it, wire push + RevenueCat, and delete or realize the cosmetic surfaces (Wrapped, widget, packs, thread, freeze).
