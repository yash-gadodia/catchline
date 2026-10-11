# Flows — how each part of Parallax works

Each flow below is walked **screen → hook/action → backend (RPC/table/RLS)**, with the exact files. Use this to change a feature with confidence, or as raw material for an improved PRD. Read alongside [ARCHITECTURE.md](../ARCHITECTURE.md).

**Two rules that shape everything:**
1. **RLS is the security backbone.** Every intimate table carries `couple_id`; you can only read rows for a couple you belong to.
2. **All cross-partner writes go through `SECURITY DEFINER` Postgres functions** (`supabase.rpc(...)`), never raw client table writes. The client is never trusted.

---

## 1. Auth & signup

**Files:** `app/login.tsx`, `app/signup.tsx`, `app/auth-callback.tsx`, `src/features/auth/authActions.ts`, `src/features/auth/useSession.ts`, `src/lib/supabase.ts`, `supabase/config.toml` `[auth]`.

- **Email signup** (`signup.tsx` → `signUpWithEmail`): creates the user with `display_name` metadata and an `emailRedirectTo` deep link. Email confirmation is **on** (`config.toml` `enable_confirmations = true`), so signup returns **no session** — the screen shows a "check your inbox" state.
- **Confirmation** (`auth-callback.tsx`): the confirmation email (template `supabase/templates/confirmation.html`) links to `parallax://auth-callback?token_hash=…`. That route calls `verifyEmailOtp(token_hash)` → establishes the session → redirects to `/`.
- **Login** (`login.tsx` → `signInWithEmail` / `signInWithApple` / `signInWithGoogle`): email/password, Apple (native `signInWithIdToken`), Google (PKCE via `expo-web-browser` → `exchangeCodeForSession`). Apple/Google emails are pre-verified, so they skip confirmation.
- **New-user backend wiring:** the `on_auth_user_created` trigger (`handle_new_user`, migration `0001`) auto-inserts a `profiles` row, copying `display_name` from user metadata. Every auth user is guaranteed a profile.
- **Session:** `useSession()` reads `getSession()` + subscribes to `onAuthStateChange`. The root route `app/index.tsx` guards: signed-in + paired → `/(tabs)/today`; otherwise → `/(onboarding)`.

**Gated:** Apple/Google need provider config in the Supabase dashboard; prod email needs Resend SMTP (see HANDOFF). Locally everything works via Mailpit + the seeded user.

---

## 2. Onboarding & pairing

**Files:** `app/(onboarding)/index.tsx`, `src/features/pairing/pairingActions.ts`, `src/features/pairing/useCouple.ts`, `src/domain/inviteCode.ts`, migration `0001`.

- Steps: **Welcome → How it works → Intents → Pair up → Joined → Notify time.** Intent selections persist to `profiles.intents` (best-effort).
- **Auth gate:** advancing past Intents requires an account — a new user is routed to `/signup` first. A signed-in but unpaired user **skips the intro straight to pairing** (the skip effect in `OnboardingScreen`).
- **Create couple** (`createCouple` → `create_couple` RPC): generates a unique invite code, inserts a `pending` couple with the caller as `member_a`. The RPC **guards against duplicates** (raises if you're already in a pending/active couple).
- **Join couple** (`joinCouple(code)` → `join_couple` RPC): validates the code, sets the caller as `member_b`, flips status to `active`, stamps `together_since`.
- `useCouple()` returns `{ couple, status }` and live-subscribes to couple changes via Realtime.

---

## 3. Daily loop & reveal (the core)

**Files:** `app/(tabs)/today.tsx`, `app/play.tsx`, `app/waiting.tsx`, `app/reveal.tsx`, `src/features/drops/dropActions.ts`, `src/domain/reveal.ts`, migrations `0002` (drops/answers + RLS), `0003` (helpers).

1. **Today** ensures today's drop exists (`ensure_today_drop` RPC — idempotent, creates a `couple_drop` with 3 prompts, `state='open'`).
2. **Play**: you answer each of 3 prompts for yourself **and** place a *hunch* on your partner.
3. **Submit** (`submit_answers` RPC): persists your rows, then sets `couple_drops.state` → `revealed` (both done), `one_done`, or stays `open`.
4. **The reveal gate (security-critical):** RLS policy `answers_select_partner_revealed` (migration `0002`) makes the partner's answers readable **only** when `state='revealed'`. Enforced in the database, never the client. Proven by `supabase/tests/*.sql` — keep those green.
5. **Waiting** gates on Realtime/poll until revealed; **Reveal** reads the now-visible answers and runs `scoreReveal()` (pure, in `src/domain/reveal.ts`) to compute the wavelength.

**Solo/demo mode:** after you submit, `sim_partner_submit` (RPC) fills a demo partner ("Dani") so a full reveal completes alone. Marked with `// SIM:` / `// GATE:` comments. This is how you test the loop without two devices.

---

## 4. Refocus (AI conflict mediation)

**Files:** `app/(tabs)/refocus.tsx` (+ refocus sub-screens), `supabase/functions/refocus/index.ts`, `src/content/refocus*`.

- Each partner privately writes their side. The client calls the **`refocus` edge function** (`supabase.functions.invoke('refocus')`), which calls **Anthropic** (Claude) with a tool-use schema and returns a structured result: where they agree, each person's angle, the need underneath, a way back, and a bridge message to send.
- The system prompt is tuned to sound human (not "AI/therapist"), bans em-dashes and therapy clichés. `ANTHROPIC_API_KEY` lives **only** server-side.
- **Gated:** needs `ANTHROPIC_API_KEY` set as an edge-function secret. Without it the function returns `not_configured` and the client falls back to a scripted exemplar. `verify_jwt = false` locally — **add auth/rate-limiting before prod** (it spends tokens per call).

---

## 5. Love Map (shared learnings)

**Files:** `app/(tabs)/us.tsx`, `app/lovemap.tsx`, `src/features/lovemap/*` (`useLearnings`, `addLearning`, `useCoupleHistory`), migration `0005`.

- A shared, growing list of things each partner learns about the other ("feels chosen when plans are locked in early"). `add_learning` RPC writes; `useLearnings` reads (falls back to sample data when unauthenticated). The **Us** tab also shows wavelength history (`useCoupleHistory`).

---

## 6. Engagement (streaks, activity, nudges)

**Files:** `src/features/engagement/*` (`useActivity`, `activityFormatter`), migration `0004`.

- An activity feed of couple events (`log_activity` RPC), a streak (`complete_streak`), and partner nudges (`nudge_partner`). `useActivity` powers the feed + unread count; `activityFormatter` turns rows into human strings.

---

## 7. Payments (Parallax Pro)

**Files:** `src/features/purchases/usePurchases.ts`, `src/features/purchases/client.ts`, `app/checkout.tsx`, `app/(sheets)/plus.tsx`.

- **RevenueCat** (entitlement "Parallax Pro"). The SDK is loaded lazily and **guarded** — outside a real build it runs in demo mode (`setDemoPro`) and never crashes Expo Go. Real purchases need RevenueCat creds + store products. **Gated.**

---

## The "gated stub" pattern

Features needing external creds are **built to the gate, behind a labeled stub** — the UI is real, but the live call is guarded so the app runs without the cred (demo/fallback). Look for `// GATE:` / `// SIM:` comments. When adding such a feature, follow this pattern rather than faking a live transaction. Full creds list: [HANDOFF.md](HANDOFF.md).
