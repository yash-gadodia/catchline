# Decision Log

A running log of major **product / tech / design** decisions — the *why* behind the code, for future blog posts and so any agent (or human) picking this up has the context that isn't visible in the diff. Newest first. Keep entries short: decision → why → alternatives → learning.

---

## 2026-06 — Solo answer-ahead (let users in before pairing)

### Pairing is no longer a wall — pending users enter the app and answer ahead
- **Decision:** A signed-up user whose partner hasn't joined (`status='pending'`) now lands in the app and can answer their own half of today's drop. The root guard (`app/index.tsx`) gates on `session && (active||pending)`; the onboarding "Waiting for them…" screen became a "You're in → answer today's drop" doorway; Today shows an invite-ahead banner + a held-reveal state. The reveal stays server-held until the partner joins **and** answers.
- **Why:** Blocking at signup — peak intent, zero investment — handed activation hostage to a partner not even in the app, with a dead-end wait they couldn't action and no taste of the product to recruit *with*. Classic two-sided cold-start mistake.
- **Gotcha (non-obvious, cost real thought):** `0010` treated **any** null member slot as "done" so a *dissolved* couple (partner deleted their account) wouldn't strand the survivor. That same shortcut would flip a *pending* solo answer straight to `revealed` against an empty partner. `0011` makes it status-aware: a null member counts as done **only when `status <> 'pending'`** — `pending` holds, `dissolved` releases. The discriminator is `couples.status`. Proven in `supabase/tests/pending_hold_test.sql`.
- **Alternatives:** Browse-only (let them in but can't answer) — simpler, but no aha. Frontend-only gate flip — broken: fires the empty reveal.
- **Follow-up:** Pending empty-states for `us`/`refocus` tabs (currently demo-data null-safe, not pending-aware); stale held-drop expiry if the partner joins days later.

---

## 2026-06 — Build & launch hardening

### Email confirmation via Resend + deep-link `token_hash`
- **Decision:** Email/password signup requires email confirmation; the confirmation email deep-links to `parallax://auth-callback?token_hash=…` which calls `verifyOtp` to create the session. Provider: Resend (3k/mo free, MCP support); dedicated Parallax sending domain (added at go-live).
- **Why:** Confirmation kills typo'd dead accounts. Resend chosen for generous free tier + MCP. Mobile PKCE can't use the default email link (no code_verifier on the device that opens the email), so the `token_hash` + `verifyOtp` pattern is the correct mobile flow.
- **Alternatives:** Instant signup (no confirmation) — simpler but lets typos through. Social-only — simplest but excludes email users.
- **Learning:** Apple/Google return *pre-verified* emails, so they skip confirmation entirely. Local dev needs no SMTP — Mailpit catches the mail.

### Social auth on both login *and* signup
- **Decision:** Apple + Google buttons on the signup screen too, not just login.
- **Why:** Users expect to "create account with Google." Social signup is actually the *easiest* path (one tap, no confirmation step).

### `main` as default branch; phase branches deleted
- **Decision:** GitHub default → `main`; deleted `phase-0-foundation` / `phase-1-auth-pairing` (both fully merged).
- **Why:** Single source of truth; the phase branches were historical scaffolding with 0 unique commits.

### Realtime channel topics must be unique per subscriber
- **Decision:** `useCouple` / `useDropState` give every subscription a **unique channel topic** (`couple-<id>-<seq>`), guard the async effect with a `cancelled` flag, and capture the channel from `.channel().on()` (not `.subscribe()`'s return) for cleanup.
- **Why (the real root cause):** `supabase.channel(topic)` **dedupes by topic** — a second caller gets back the *already-subscribed* channel, so `.on()` on it throws "cannot add `postgres_changes` callbacks after `subscribe()`". Several screens subscribe at once (mounted tabs + the root guard all call `useCouple`), so the fixed name `couple-<id>` collided and crashed right after login. The `cancelled` flag alone (for React's double-mount) was necessary but not sufficient — unique topics are what actually fix it.
- **Learning:** with supabase-js, never reuse a channel topic across independent subscribers; verify library behavior in `node_modules` before assuming. Long term, a single shared subscription (store/context) would beat N per-screen channels.

## Architecture invariants (set early, still hold)

### RLS is the security backbone; the reveal gate lives in the database
- **Decision:** Every intimate table carries `couple_id`; partner answers are unreadable until `couple_drops.state='revealed'`. Enforced in RLS, proven by pgTAP — never in the client.
- **Why:** The whole product promise is "neither sees the other's answer until both submit." A client-side gate is a privacy lie waiting to leak. The DB is the only trustworthy place.
- **Learning:** All cross-partner writes go through `SECURITY DEFINER` RPCs (`submit_answers`, `create_couple`, …). The client never writes cross-partner rows directly.

### Realtime (Supabase channels), not polling
- **Decision:** Pairing status and "partner answered" both update via Supabase Realtime `postgres_changes` subscriptions (`useCouple` on `couples`, `useDropState` on `couple_drops`), not interval polling.
- **Why:** Instant reveal the moment the partner submits; no wasted requests. (A code comment still says "polling" — it's actually realtime; worth renaming.)

### Solo/demo mode for single-person testability
- **Decision:** `sim_partner_submit` auto-creates a demo partner ("Dani") so one person can complete a full reveal alone; hooks fall back to local/sample data when unauthenticated.
- **Why:** A two-person app is painful to dev/test with one device. Demo mode keeps the whole loop exercisable solo.

### "Gated stub" pattern for credential-bound features
- **Decision:** Features needing external creds (Refocus AI, RevenueCat, push, prod email) ship as real UI behind a labeled guard (`// GATE:` / `// SIM:`) that falls back gracefully — never a faked live transaction.
- **Why:** The app stays fully runnable without secrets, and go-live is "add the cred," not "build the feature."

## Design / RN fidelity

### `Float` `duration` = full bob cycle (matches design `pxfloat 4s`)
- **Decision:** `Float.duration` means the full down-and-up cycle (each leg = duration/2), default 4000.
- **Why:** The design's `animation: pxfloat 4s` is a full-cycle time; the component had treated it as per-leg, so *every* mascot/logo bobbed at half speed. Aligning the semantics fixed the logo bounce app-wide at once.

### RN porting traps (the expensive ones)
- `lineHeight` is **pixels**, not a CSS multiplier (`fontSize*~1.4`). Every `<Text>` needs its **own** `color` (RN doesn't inherit). Reuse the `src/components` atoms; don't reimplement. Web→RN swaps: gradient text → `GradientText`, blur → expo-blur, gradients → expo-linear-gradient, CSS keyframes → Reanimated. Full list in `.claude/rules/frontend.md`.

## Tooling

### OrbStack is the Docker engine (not a second tool)
- **Decision:** Docker via OrbStack on macOS. `docker` CLI talks to OrbStack's daemon — OrbStack *replaces* Docker Desktop, it's not additive.
- **Why:** Lighter/faster than Docker Desktop on Apple Silicon. If `docker ps` fails with "cannot connect to the daemon," OrbStack just isn't running (`open -a OrbStack`).

### Co-located tests live in `__tests__/`, never beside routes in `app/`
- **Decision:** Screen tests go in `app/**/__tests__/`, not `app/foo.test.tsx`.
- **Why:** Expo Router treats files under `app/` as routes; a colocated `*.test.tsx` gets bundled as a route and breaks `expo export`. `__tests__/` dirs are excluded.

### `fireEvent.changeText` needs an `act()` wrapper here
- **Decision:** In RN 0.85 + React 19 + RNTL 14, wrap field edits in `await act(async () => …)` or the controlled `value` won't flush before the next interaction.
- **Why:** Lost ~an hour to this; documented so the next person doesn't.

### 2026-07-05 sprint: product calls made by the agent (Dani can veto)
- **Wrapped ships** (it already runs on real data; cutting it saves nothing).
- **Therapist escalation: yes, gentle** — after 3 completed Refocuses in 30 days, a dismissible card (count-keyed re-eligibility) linking CPH online counselling + Family Service Centres. Copy pending Dani's tone review.
- **Streak stays visible, copy softened** — celebration-not-fear per the 2026-06-30 Paired research; mechanics (freezes/catch-up/repair) untouched.
- **F5 honesty** — Today's drop label now comes from the server (`get_today_state.drop_code`, 0035); the static code only serves signed-out demo.

### Never trust Supabase default ACLs (grant AND revoke explicitly)
- **Decision:** Every table migration states its own grants and revokes; environment defaults are not a contract (0036 restored `refocus_sessions` to SELECT-only).
- **Why:** Newer stacks default-grant anon/authenticated ALL on new tables — the 0006-era "defaults give no DML" lesson inverted silently. pgTAP grant assertions caught it; RLS held throughout.

### One DB verifier at a time
- **Decision:** Only the session lead runs `supabase db reset` / `supabase test db`; parallel agents author SQL and hand it over.
- **Why:** Two concurrent resets produce 502s and mass phantom "Bad plan" failures that look like real regressions.
- **2026-07-07 · V2 fight-flywheel plan approved** — `docs/V2_PLAN.md` (autoplan: CEO+design+eng, 26 logged decisions). Taste calls: quiet provenance row on woven reveals · growth-counter hero on Us · F3 weave stays S3 behind the quality gate (competitive watch trigger) · refocus-text encryption deferred to Phase 2. S0 safety audit blocks F1; S1 doubles as the instrumented TestFlight beta.
