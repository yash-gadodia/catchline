# Handoff — owning & extending Parallax

For Dani (and her AI agents) taking over the codebase: how it's built to be worked on, how to add features safely, what's left for go-live, and how to write a better PRD.

## TL;DR

- The app is **feature-complete for the core loop** and runs end-to-end locally (see [FLOWS.md](FLOWS.md)). 220+ tests, RLS/reveal-gate pgTAP-proven.
- It's set up to be **driven by AI agents** — read [CLAUDE.md](../CLAUDE.md) and `.claude/rules/` first; they encode the hard-won rules.
- What's not live is **gated on external credentials**, not missing code (see [Go-live checklist](#go-live-checklist)).

## How this repo is built for agents

| File | Role |
|---|---|
| `CLAUDE.md` | The contract every agent follows — stack, commands, conventions, "do nots". Loaded into every Claude session. |
| `ARCHITECTURE.md` | System map + data flow. Read before structural changes. |
| `.claude/rules/workflow.md` | The auto workflow: clarify → plan → implement (test-first) → review → verify, scaled to task size. Agents follow it without being told. |
| `.claude/rules/frontend.md` | RN fidelity traps that caused real bugs (lineHeight is px, Text needs its own color, reuse atoms, web→RN swaps). |
| `.claude/rules/database.md` | RLS + `SECURITY DEFINER` rules, migrations, the supabase-js `never` typing quirk. |
| `.claude/rules/testing.md` | Exact-assertion testing, no hollow tests, jest mocks, pgTAP hermeticity. |
| `.claude/rules/git.md` | Conventional Commits, branch off `main`, never commit secrets. |

If you use a different agent tool, point it at `CLAUDE.md` + `.claude/rules/` — they're plain markdown.

### Automated guardrails (`.claude/settings.json` hooks)

These run automatically — no one has to remember them:

- **PreToolUse** — blocks writes to secret files (`.env`, `*.key`, `*.pem`, credentials).
- **PostToolUse** — on every `.ts/.tsx` edit, instantly rejects `@ts-ignore` and hollow tests (`expect(<JSX/>)`), the repo's two banned patterns. The agent gets the message and fixes it on the spot.
- **Stop** — when a turn touched any `.ts/.tsx`, runs an incremental typecheck before the agent can finish; if it's red, the agent must fix it first. (Skips instantly on conversational turns, so there's no latency tax when no code changed.)

Net effect: a turn can't end with a type error or a banned pattern, even from a vague prompt.

## Adding a feature safely (the non-negotiables)

1. **Test-first.** Co-locate `*.test.ts(x)`. Assert exact values, render + assert real content (never `expect(<JSX/>).toBeTruthy()`). Pure logic → `src/domain` with unit tests.
2. **Cross-partner data goes through a `SECURITY DEFINER` RPC** + a migration (`supabase/migrations/00NN_*.sql`, idempotent). Add the RPC/table to `src/types/db.ts`. Never trust the client; never bypass the reveal gate.
3. **Reuse the atom library** (`src/components`) and `src/design` tokens — don't reimplement Btn/Peek/etc. or hardcode hex.
4. **No `any` / `@ts-ignore`** in source (one documented `@ts-expect-error` is allowed for the supabase-js `never` quirk).
5. **Gated features** use the labeled-stub pattern (`// GATE:` / `// SIM:`) — real UI, guarded live call, graceful fallback. Don't fake a live transaction.
6. **Definition of done:** `npm run typecheck` (0) · `npm test` (green) · `npx expo export -p ios` (bundles) · `supabase test db` if you touched SQL. Show the output — don't claim done from inference.
7. After **2 failed attempts** at the same approach, stop and rethink. Keep changes scoped to the task.

## CI/CD pipeline

GitHub Actions, in `.github/workflows/`:

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | every push / PR | typecheck + tests (the safety net — always on) |
| `ota-update.yml` | push to `main` | ships JS/asset changes **over-the-air** to the `preview` channel — testers get them instantly, no store review. *No-ops until `EXPO_TOKEN` is set.* |
| `deploy-ios.yml` | **manual** (Actions tab → Run workflow) | runs checks, then `eas build` (iOS), and optionally `eas submit` to the App Store. Pick `preview` or `production`. |

**One-time setup to turn the pipeline on:**
1. Create an Expo account + `npx eas init` in the repo (writes `extra.eas.projectId` into `app.json`).
2. Set a **real `ios.bundleIdentifier`** in `app.json` (currently the `com.anonymous.parallax` placeholder).
3. Add repo secret **`EXPO_TOKEN`** (expo.dev → Account → Access Tokens) — this alone enables OTA + EAS builds from CI.
4. For App Store submit: configure Apple creds once via `eas credentials` (or an App Store Connect API key in `eas.json` `submit.production`). Needs the Apple Developer account.

After that: merges to `main` auto-ship OTA JS updates; cutting a release is one click of "Deploy iOS (EAS)".

## Go-live checklist

Everything below is **built; it just needs credentials/config**. Set secrets via `supabase secrets set` / EAS secrets / the relevant dashboard — don't hardcode them.

**Required to ship:**
- [ ] **Production Supabase project** — `supabase link` + push migrations; put prod URL + anon key in EAS env. Set Auth Site URL + redirect to `parallax://auth-callback`.
- [ ] **Real bundle identifier** — currently `com.anonymous.parallax` (placeholder). Pick a real one before store/Apple/Google setup.
- [ ] **Apple Developer account** — App ID with "Sign In with Apple"; App Store Connect record.
- [ ] **EAS build** — Apple/Google/RevenueCat/push need a dev/prod build (not Expo Go).

**Per-feature creds (app runs without each):**
- [ ] **Apple Sign-In** — Services ID, Team ID, Key ID, `.p8` in Supabase Auth provider.
- [ ] **Google Sign-In** — Google Cloud OAuth client(s) → Supabase Google provider.
- [ ] **Anthropic** (Refocus) — `supabase secrets set ANTHROPIC_API_KEY=…`, deploy the `refocus` function, **add auth/rate-limiting** for prod.
- [ ] **RevenueCat** — public SDK keys (`appl_…`/`goog_…`, not a secret `sk_`), products + "Parallax Pro" entitlement linked to App Store Connect / Play.
- [ ] **Production email (Resend)** — verify a sending domain, set `RESEND_SMTP_PASSWORD`, fill the `[auth.email.smtp]` block in `config.toml` (scaffolded) or the dashboard. Locally email works via Mailpit.
- [ ] **Push** (APNs key / FCM) and **home widget** (native) — optional for first launch.

## Writing an improved PRD

Source material, in order of usefulness:
1. **[FLOWS.md](FLOWS.md)** — what the product actually does today, flow by flow. Your "as-built" baseline.
2. **`design_handoff_parallax/`** — original visual + product intent (the design source of truth).
3. **[ARCHITECTURE.md](../ARCHITECTURE.md)** — constraints any new feature must respect (RLS, the reveal gate, the daily-loop shape).
4. **`src/content/`** — the actual prompt/copy data; the "voice" of the product lives here and in the Refocus edge function's system prompt.

A good PRD here should respect the two invariants (RLS-enforced privacy; the both-must-submit reveal gate) and the design system, and lean on the solo/demo mode so features stay testable by one person.

## Test access

```bash
./scripts/seed-test-user.sh          # → test@parallax.app / parallax123 (pre-confirmed)
```
Sign in via "I already have an account". Solo/demo mode lets one person complete the whole daily loop. Real signup emails are caught by Mailpit (http://127.0.0.1:54324).
