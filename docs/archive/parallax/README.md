# Parallax

> A Gen-Z **couples app**. Every day both partners get the same 3-prompt "drop": each answers for themselves and places a *hunch* on the other. Once both submit, a **server-gated reveal** scores their "wavelength." **Refocus** (AI conflict mediation) and a shared **Love Map** feed the same compounding loop.

React Native + Expo (SDK 56) · Supabase (Postgres + Auth + Realtime + Edge Functions) · TypeScript.

---

## Quickstart (macOS)

```bash
# 0. Prereqs: Node 20+ LTS, Xcode + an iOS simulator, Docker (OrbStack), Supabase CLI
#    See docs/DEV_SETUP.md for the full, troubleshootable version.

# 1. Install JS deps (the legacy flag is required — reanimated/worklets peer range)
npm install --legacy-peer-deps

# 2. Env: point the app at your local Supabase
cp .env.example .env          # then fill in the two values printed by `supabase start`

# 3. Backend: start local Supabase + apply migrations & seed
supabase start
supabase db reset

# 4. Seed a pre-confirmed test user so you can skip the signup email
./scripts/seed-test-user.sh   # → test@parallax.app / parallax123

# 5. Run the app on the iOS simulator (builds the native dev client)
npm run ios
```

**Sign in fast:** on the Welcome screen tap **"I already have an account"** → `test@parallax.app` / `parallax123`. A signed-in user skips the intro straight to pairing. (Real signups send a confirmation email — caught locally by **Mailpit → http://127.0.0.1:54324**.)

## Commands

| Task | Command |
|---|---|
| **One-command local run** | `npm run dev` (heals env: OrbStack + Supabase + `.env` sync + seed, then launches) |
| **Diagnose/fix the env** | `npm run doctor` (report) · `npm run doctor:fix` (auto-repair) |
| Dev server | `npm start` (then `i` for iOS) |
| Run on iOS (dev build) | `npm run ios` |
| Tests | `npm test` · watch: `npm run test:watch` |
| Typecheck | `npm run typecheck` |
| Bundle check (all routes) | `npx expo export -p ios` |
| DB reset (migrations + seed) | `supabase db reset` |
| DB/RLS tests (pgTAP) | `supabase test db` |
| Seed a test user | `./scripts/seed-test-user.sh [email] [pw] [name]` |

**Definition of "done" for any change:** `npm run typecheck` (0) · `npm test` (green) · `npx expo export -p ios` (bundles).

## Where things live

```
app/                Expo Router routes (file-based)
  (onboarding)/     welcome → how-it-works → intents → pair-up
  (tabs)/           Today · Refocus · Us
  (sheets)/         transparent modal sheets (plus, share, spice)
  signup.tsx        email/password signup → email confirmation
  auth-callback.tsx deep-link target that completes email confirmation
  login.tsx         sign in (email + Apple + Google)
src/
  components/       pixel-faithful atom library (don't reimplement — reuse)
  design/           tokens, typography, fonts
  domain/           pure, RN-free, unit-tested logic (reveal scoring, mood, invite codes)
  features/         data layers: auth, pairing, drops, engagement, lovemap, onboarding, purchases
  lib/              supabase client, react-query client
  store/            Zustand (UI/local state)
  content/          seed copy (prompts, us, refocus, pay)
supabase/
  migrations/       0001..0005 (profiles/couples, drops/answers, daily-loop fns, engagement, learnings)
  functions/        refocus (Anthropic edge function)
  tests/            pgTAP — RLS + the reveal gate
design_handoff_parallax/   the original design source of truth
```

## Documentation map

| Doc | Read it for |
|---|---|
| **[WORKING_WITH_CLAUDE.md](WORKING_WITH_CLAUDE.md)** | Non-technical guide to building here by talking to Claude (start here, Dani) |
| **[docs/DEV_SETUP.md](docs/DEV_SETUP.md)** | Full local setup from a clean machine + troubleshooting |
| **[docs/FLOWS.md](docs/FLOWS.md)** | Every user flow walked end-to-end → exact files/RPCs (for feature work + a better PRD) |
| **[docs/HANDOFF.md](docs/HANDOFF.md)** | Taking ownership: how the AI-agent setup works, how to add features safely, go-live checklist |
| **[docs/DECISIONS.md](docs/DECISIONS.md)** | The *why* behind major product/tech/design choices (blog material + context) |
| **[docs/BUILD_LOG.md](docs/BUILD_LOG.md)** | How this app was built with Claude (workflow, agents, best practices) |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System map, data flow, module boundaries |
| **[CLAUDE.md](CLAUDE.md)** | The rules Claude/agents follow in this repo |
| **`.claude/rules/`** | Hard-won specifics: frontend fidelity, database/RLS, testing, workflow, git |
| **`design_handoff_parallax/`** | The original visual design + product intent |

## Status

The full loop works end-to-end: **auth (email + confirmation, Apple, Google) → onboarding → pairing → daily drop → reveal → Refocus → Love Map**, with a solo/demo mode so one person can test the whole loop. RLS + the reveal gate are pgTAP-proven.

**Gated behind external credentials** (UI built, flips on when creds are added — see [docs/HANDOFF.md](docs/HANDOFF.md)): Apple/Google provider config, Anthropic key (Refocus), RevenueCat (payments), push (APNs/FCM), home widget, and production email (Resend SMTP).

_Private project. Not for redistribution._
