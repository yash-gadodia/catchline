# Phase 1 — Auth + Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Read the roadmap's Global Constraints first. Builds on Phase 0 (branch `phase-1-auth-pairing` off `phase-0-foundation`).

**Goal:** A real couple can sign in, one creates a couple + invite code, the partner joins via the code, and both land on Today — backed by Supabase with RLS, driven by the 6-step onboarding flow.

**Architecture:** Supabase (Postgres + Auth + Realtime) behind `@supabase/supabase-js`. `profiles` extends `auth.users`; `couples` is the pairing unit everything intimate hangs off. All pairing mutations go through SECURITY DEFINER Postgres functions (never trust the client). RLS = "current user is a member of this couple." Auth session persists via AsyncStorage. Onboarding UI (ported from the prototype) drives auth → intent capture → couple creation/joining → notify-time → Today.

**Tech Stack:** @supabase/supabase-js, expo-apple-authentication (Apple), @react-native-google-signin/google-signin or expo-auth-session (Google), expo-linking (deep-link invites), AsyncStorage, react-native-url-polyfill. Supabase CLI + Docker (OrbStack) for local schema/RLS testing.

## Global Constraints

Roadmap Global Constraints apply. Most load-bearing here:
- **RLS on every table from day one.** profiles + couples carry policies; partner data readable only via shared couple membership.
- **Pairing mutations server-side only.** `create_couple` / `join_couple` are SECURITY DEFINER functions with guards — the client calls them via RPC, never writes couples directly.
- **No secrets in client.** Only `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (anon key is RLS-protected, safe to ship). Service-role key never in the app.
- **TypeScript everywhere; no `any` in source.**
- **Onboarding copy/structure exact** per `design_handoff_parallax/design_files/couples-flows.jsx` Onboarding (6 steps; progress dots on the 4 stepped screens; intent multi-select; invite code; "Dani joined" moment; notify-time chips).

## Service gate (controller flags to the human; build proceeds around it)

| Needed for | What to provision |
|---|---|
| Live auth + real DB (Tasks 2 test, 4 OAuth, 7 live) | Supabase project: URL + anon key (+ service-role for migrations/CI) |
| Apple sign-in | Apple Developer "Sign in with Apple" capability + a dev build (not Expo Go) |
| Google sign-in | Google OAuth client IDs (iOS/Android/web) |
| Invite deep links | confirm an app scheme (`app.json` `scheme`) + universal/app links domain |
| Local schema/RLS tests | Supabase CLI installed + Docker/OrbStack running (`supabase start`) |

**Credential-free now:** invite-code domain (T1 wait—renumber), schema + RLS migration SQL (T-schema), supabase client wiring with placeholder env (T-client), data-layer code (auth email + pairing), onboarding UI, routing gate. Live OAuth + running migrations against the real project happen once creds land.

## File structure (added this phase)

```
supabase/
  config.toml                 local dev config
  migrations/0001_profiles_couples.sql   tables + RLS + functions + new-user trigger
  seed.sql                    (optional) a demo profile
src/
  lib/supabase.ts             typed client (env-driven, AsyncStorage session)
  domain/inviteCode.ts        format + validate (pure)
  features/auth/
    useSession.ts             session state via onAuthStateChange
    authActions.ts            email sign-in/up, signOut, apple/google (OAuth)
  features/pairing/
    useCouple.ts              fetch couple + realtime status
    pairingActions.ts         createCouple(), joinCouple(code) via rpc
  types/db.ts                 hand-written DB row types (or generated later)
app/
  (onboarding)/index.tsx      the 6-step flow (replaces the stub)
  index.tsx                   auth/pairing gate (replaces the redirect stub)
.env.example                  documents EXPO_PUBLIC_SUPABASE_* vars
```

---

### Task 1: Invite-code domain logic (pure, TDD)

**Files:** Create `src/domain/inviteCode.ts`, `src/domain/inviteCode.test.ts`

**Interfaces:** `formatInviteCode(raw: string): string` (uppercases, strips spaces, inserts the dash as `XXXX-NNNN`); `isValidInviteCode(code: string): boolean` (matches `^[A-Z0-9]{4}-[0-9]{4}$`); `normalizeInviteCode(input: string): string` (user typing → canonical for lookup: uppercase, keep alnum, re-insert dash).

- [ ] **Step 1: failing tests** — `isValidInviteCode('YASH-4827')===true`; `isValidInviteCode('yash4827')===false`; `normalizeInviteCode('yash 4827')==='YASH-4827'`; `formatInviteCode('ABCD1234')==='ABCD-1234'`; reject wrong lengths.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement the three pure functions (regex + string ops; no RN import).
- [ ] **Step 4:** run → PASS; `npm run typecheck`.
- [ ] **Step 5:** commit `feat: invite-code domain logic`.

---

### Task 2: DB schema + RLS migration (profiles + couples + functions)

**Files:** Create `supabase/config.toml`, `supabase/migrations/0001_profiles_couples.sql`; Test: `supabase/tests/rls.test.sql` (pgTAP) OR `src/features/pairing/__tests__/rls.integration.test.ts`.

**Interfaces (SQL surface later tasks call):**
- `profiles(id uuid pk → auth.users, display_name text, avatar_url text, intents text[], spice_level text default 'flirty', notify_time time, notify_tz text, push_token text, created_at timestamptz default now())`
- `couples(id uuid pk default gen_random_uuid(), member_a uuid → profiles, member_b uuid → profiles null, invite_code text unique, status text default 'pending' check in ('pending','active'), together_since date, streak int default 0, longest_streak int default 0, freezes_remaining int default 2, last_played_on date, wavelength_avg numeric, plus boolean default false, created_at timestamptz default now())`
- RPC `create_couple() returns couples` — caller becomes member_a, generates a unique invite_code, status 'pending'; errors if caller already in a pending/active couple.
- RPC `join_couple(p_code text) returns couples` — caller becomes member_b of the matching pending couple, status 'active', together_since = current_date; errors if code missing, couple not pending, caller is member_a, or caller already coupled.
- Trigger `on_auth_user_created` → inserts a `profiles` row (id, display_name from metadata).

- [ ] **Step 1: write the migration** — tables above; `alter table ... enable row level security`; policies: profiles — select/update own (`id = auth.uid()`), select partner (`id in (select partner of caller's couple)`); couples — select/update where `auth.uid() in (member_a, member_b)`. `create_couple`/`join_couple`/`gen_invite_code`/`handle_new_user` as `security definer` functions with `search_path = public`. Invite code = 4 random uppercase alnum + '-' + 4 digits, retry on unique collision.
- [ ] **Step 2: write the RLS/function test** (pgTAP in `supabase/tests/` OR a JS integration test using the service-role + two anon JWTs). Assert: member can read own couple; a NON-member cannot read it; `join_couple` flips status to 'active' and sets member_b; a third user cannot join an already-active couple; the partner's `profiles` row is readable only after pairing.
- [ ] **Step 3: run locally** — `supabase start` (Docker), `supabase db reset` to apply the migration + run tests. Expected: PASS. **If Supabase CLI/Docker is unavailable, STOP and report BLOCKED** — this task's verification needs them; do not fake it.
- [ ] **Step 4: commit** `feat: profiles+couples schema, RLS, pairing functions`.

---

### Task 3: Supabase client + env wiring

**Files:** Create `src/lib/supabase.ts`, `src/types/db.ts`, `.env.example`; Test: `src/lib/supabase.test.ts`.

**Interfaces:** `supabase` (typed `SupabaseClient<Database>`); `Database` row types in `types/db.ts` for profiles + couples matching the migration.

- [ ] **Step 1:** `.env.example` with `EXPO_PUBLIC_SUPABASE_URL=` and `EXPO_PUBLIC_SUPABASE_ANON_KEY=`.
- [ ] **Step 2: failing test** — importing `supabase` exposes `.auth` and `.from`; throws a clear error if env vars are missing/placeholder (so misconfig fails loudly, not silently).
- [ ] **Step 3: implement** — `import 'react-native-url-polyfill/auto'`; `createClient(url, anon, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`; read env via `process.env.EXPO_PUBLIC_*`; hand-write `Database`/row types in `types/db.ts`.
- [ ] **Step 4:** run → PASS (mock AsyncStorage + env in the test); `npm run typecheck`.
- [ ] **Step 5: commit** `feat: supabase client + db types + env`.

---

### Task 4: Auth data layer (email now; OAuth scaffolded)

**Files:** Create `src/features/auth/useSession.ts`, `src/features/auth/authActions.ts`; Test: `src/features/auth/auth.test.ts`.

**Interfaces:** `useSession(): { session: Session|null, loading: boolean }` (subscribes via `supabase.auth.onAuthStateChange`); `signInWithEmail(email,pw)`, `signUpWithEmail(email,pw,displayName)`, `signOut()`, `signInWithApple()`, `signInWithGoogle()`.

- [ ] **Step 1: failing test** — with a mocked `supabase.auth`, `useSession` reflects sign-in/out; `signInWithEmail` calls `supabase.auth.signInWithPassword`; `signOut` calls `supabase.auth.signOut`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement** email + session fully. For Apple/Google: implement via `expo-apple-authentication` → `supabase.auth.signInWithIdToken({provider:'apple', token})` and Google id-token → `signInWithIdToken({provider:'google'})`. **Guard with a clear runtime error if the native module/creds aren't configured** (so it fails loudly until the service gate is met). No `any`.
- [ ] **Step 4:** run → PASS; typecheck.
- [ ] **Step 5: commit** `feat: auth data layer (email + OAuth scaffold)`.

---

### Task 5: Pairing data layer

**Files:** Create `src/features/pairing/useCouple.ts`, `src/features/pairing/pairingActions.ts`; Test: `src/features/pairing/pairing.test.ts`.

**Interfaces:** `useCouple(): { couple: Couple|null, loading, status: 'none'|'pending'|'active' }` (fetches caller's couple + subscribes to Realtime changes on the row); `createCouple(): Promise<Couple>` (rpc `create_couple`); `joinCouple(code: string): Promise<Couple>` (normalizes via inviteCode domain, rpc `join_couple`).

- [ ] **Step 1: failing test** — mocked supabase: `createCouple` calls `rpc('create_couple')`; `joinCouple('yash 4827')` normalizes to `YASH-4827` then `rpc('join_couple',{p_code:'YASH-4827'})`; `useCouple` derives status from the row.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement** using `supabase.rpc(...)`, the inviteCode domain (T1), and a Realtime channel on the couples row keyed by id.
- [ ] **Step 4:** run → PASS; typecheck.
- [ ] **Step 5: commit** `feat: pairing data layer (create/join + realtime status)`.

---

### Task 6: Onboarding 6-step UI

**Files:** Replace `app/(onboarding)/index.tsx`; maybe `src/features/onboarding/steps/*`; Test: `app/(onboarding)/__tests__/onboarding.test.tsx`.

**Source:** `design_handoff_parallax/design_files/couples-flows.jsx` Onboarding (lines ~20–194).

**Interfaces:** A stepped flow with state `{ step, intents[], moment }`. Steps: (0) Welcome — Peek + wordmark + tagline + "Get started"/"I already have an account"; (1) How it works — 3 avatar+title+sub; (2) Intent capture — 5 multi-select chips (know/talk/rough/far/fun), continue disabled until ≥1, saves to profile; (3) Pair up — shows the invite code from `createCouple()` + "Send Dani the link" (share) + "enter a code" path → `joinCouple()`; (4) Joined — celebratory "Dani joined!" (driven by `useCouple().status==='active'` via realtime); (5) Notify time-anchoring — 4 time chips + "Turn on daily nudge" → saves notify_time, then `finish()`. Progress dots on the 4 stepped screens (welcome + joined are dot-less moments).

- [ ] **Step 1: failing test** — renders step 0 with the tagline; pressing "Get started" advances; intent step's continue is disabled until a chip is selected then enabled; the pair-up step renders an invite code area.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement** the flow using Phase 0 atoms (Btn, Chip, Tok, Peek, Wordmark, Serif, Kick, ScreenStub bg). Wire intent → profile update; pair-up → `createCouple`/`joinCouple`; joined → realtime status; notify → profile update. Where live auth/couple isn't available (no creds), the UI still renders and advances with local state (so it's demoable), but calls the real data layer when a session exists.
- [ ] **Step 4:** run → PASS; typecheck; `npx expo export -p ios` exit 0.
- [ ] **Step 5: commit** `feat: 6-step onboarding flow`.

---

### Task 7: Auth/pairing routing gate

**Files:** Replace `app/index.tsx`; maybe `src/features/auth/AuthGate.tsx`; Test: `app/__tests__/index-gate.test.tsx`.

**Interfaces:** `app/index.tsx` decides initial route from `useSession()` + `useCouple()`: no session → onboarding (auth); session + no active couple → onboarding (resumes at pair-up); active couple → redirect `/(tabs)/today`. While loading → a splash/null.

- [ ] **Step 1: failing test** — with mocked hooks: no session → routes to onboarding; active couple → routes to today.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement** the gate (use expo-router `Redirect`); ensure no flET-of-wrong-screen during load.
- [ ] **Step 4:** run → PASS; typecheck; export exit 0.
- [ ] **Step 5: commit** `feat: auth/pairing routing gate`.

---

### Task 8: Native config for OAuth + deep-link invites (SERVICE-GATED)

**Files:** `app.json` (scheme, plugins, associated domains), `src/features/pairing/deepLink.ts` (parse invite links → prefill join code).

**Interfaces:** App scheme `parallax://`; invite URL `https://<domain>/invite/<CODE>` → opens app → onboarding pair-up prefilled.

- [ ] **Step 1:** add `app.json` `scheme: "parallax"`, expo-apple-authentication + Google plugins, associated domains placeholder. Deep-link parser with a unit test (pure parse → code).
- [ ] **Step 2: BLOCKED until creds** — live Apple/Google sign-in + universal links require the service gate (Apple capability, Google client IDs, a dev build, a domain). Implement the parser + config scaffolding now; flag the live wiring + dev-build verification to the human.
- [ ] **Step 3: commit** `feat: deep-link invite parsing + native auth config scaffold`.

---

## Self-Review

**Spec coverage:** profiles+couples+RLS→T2; auth (email+OAuth)→T4; create/join/invite-code→T1+T2+T5; onboarding 6 steps→T6; pairing realtime "Dani joined"→T5+T6; routing→T7; deep-link invite→T8. "Done when two devices pair" requires the service gate (real Supabase + a dev build) — Tasks 1,3,5,6,7 + the SQL of T2 are buildable/unit-testable now; T2's RLS test needs local Supabase (Docker); T4 OAuth-live + T8 need creds.

**Ordering note:** T1 (pure) and T3/T2 are the backbone; T4/T5 depend on T3; T6 depends on T4/T5/T1; T7 depends on T4/T5. Build T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8.

**Placeholder scan:** SQL function names (`create_couple`, `join_couple`) and hook signatures are fixed and reused consistently across T2/T5/T6/T7.
