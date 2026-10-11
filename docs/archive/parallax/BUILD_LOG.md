# Build Log — how this app was built with Claude

A record of *how* Parallax was built using Claude Code — the workflow, the agent patterns, and the practices that worked. For a future blog post on "building a full app with an AI agent," and so the system keeps improving instead of relearning the same lessons.

---

## The setup that made it work

The repo is **AI-native by construction** — the agent's rules live in the repo, not in someone's head:

- **`CLAUDE.md`** — the contract loaded into every session: stack, commands, conventions, hard "do nots". This is the single highest-leverage file.
- **`.claude/rules/`** — hard-won specifics the agent can't infer: `frontend.md` (RN fidelity traps), `database.md` (RLS/SECURITY DEFINER), `testing.md` (no hollow tests), `workflow.md` (the auto loop), `git.md`.
- **`ARCHITECTURE.md` + `docs/`** — deep context read on demand, keeping `CLAUDE.md` lean.
- **Memory** — durable facts/learnings the agent records across sessions.

**Lesson:** time spent encoding rules up front pays back every single turn. The rules are what stop an agent from "fixing" valid RN code or shipping a hollow test.

## Driving the work: `/goal` and `/loop`

- **`/goal <condition>`** sets a session-scoped Stop hook — the agent can't stop until the condition is verifiably met. Used for things like "every flow covered by unit tests," "ready to go live," "the UI follows the design closely." It keeps the agent honest: it must produce evidence, not a claim.
- **`/loop`** runs a prompt continuously (self-paced or on an interval) — used for "keep going until the app is done." Good for long autonomous stretches.

**Lesson:** goals are most effective when the condition is *checkable* (tests green, screen matches, creds listed). Vague goals ("make it nice") give the hook nothing to verify.

## Multi-agent patterns

- **Parallel read-only audits.** To check design fidelity across screens, dispatched 5 `researcher` subagents at once — each compared one screen (FE ↔ design source) and returned a ranked, concrete diff. Read-only = no edit conflicts; parallel = fast. The controller then applied fixes sequentially.
- **Workflows for comprehensive sweeps.** Multi-stage `Workflow` runs (find → adversarially verify → synthesize) for bug/PRD audits — e.g. a 30-agent pass that generated unit tests for every screen, then verified them together.
- **Adversarial verify.** Findings get a second, skeptical pass before being treated as real — kills plausible-but-wrong conclusions.
- **Delegate verbose ops.** Long test runs / log analysis go to subagents so the main context stays clean.

**Lesson:** parallelize *independent* work (audits, finders); keep *mutations* sequential. Always verify findings before acting on them.

## Verify before claiming (the core discipline)

Nothing is "done" on inference. The standing bar for any change:

```
npx tsc --noEmit     # 0 errors
npx jest             # all green (parallel AND --runInBand for flake)
npx expo export -p ios   # bundles every route
supabase test db     # pgTAP, if SQL changed
```

Plus, for anything user-facing: **load it on the simulator and screenshot it.** A build succeeding ≠ the screen looking right. This caught real bugs (a colocated test breaking `expo export`; a timer leak crashing the suite; the half-speed logo bounce).

**Lesson:** "show the output" is non-negotiable. One false "shipped!" costs more trust than a hundred verifications cost time.

## Testing discipline

- **Test-first**, exact assertions (not `> 0` / truthy), tests must `render()` + assert real content — never `expect(<JSX/>).toBeTruthy()`.
- Pure logic (`src/domain`) is unit-tested with exact values; RLS/reveal-gate is pgTAP-proven.
- Coverage went 109 → 220 tests; the suite is stable under both parallel and `--runInBand`.

**Lesson:** hollow tests are worse than no tests — they make CI green while testing nothing. Reject them in review.

## Root-cause over patch

When something broke, the rule was: form a hypothesis, investigate, fix the cause — and after 2 failed attempts, stop and rethink instead of brute-forcing. Examples: the "flaky" suite was actually one leaked `setTimeout`; the slow logo bounce was a per-leg-vs-full-cycle semantics bug, not a per-screen tweak.

## Design source of truth via MCP

The `claude_design` MCP connector reads the design project directly (`DesignSync`), so the agent implements against the *actual* design files (`couples-*.jsx`), not a screenshot guess.

## iOS go-live: Apple creds + auth providers (29 Jun 2026)

Wired the iOS launch credentials end-to-end. Reusable steps + gotchas → `docs/APP_DEPLOYMENT.md` ("Apple identifiers, push key & auth providers"); secret-handling default → `.claude/rules/secrets.md`. Non-obvious lessons:

- **Sign in with Apple = App ID, not a Services ID.** Native RN/Expo uses `signInWithIdToken` → needs an **App ID** with the capability. A *Services ID* is the web OAuth flow (asks for domains/return URLs — the wrong path). Apple identifiers are globally unique across types, so a stray Services ID on the bundle string blocks the App ID.
- **APNs key environment matters.** TestFlight + App Store use the **Production** APNs env; a Sandbox-only `.p8` silently fails for testers/users. Make the key Sandbox+Production. The token `.p8` replaces the legacy per-App-ID SSL certs (ignore that dialog).
- **Supabase provider via Management API, not `config push`.** `PATCH /v1/projects/{ref}/config/auth` with `external_apple_enabled` + `external_apple_client_id` (= bundle ID); secret stays null for the native flow. `supabase config push` would clobber prod with local `config.toml`.
- **Headless EAS needs the ASC API key.** With only `EXPO_TOKEN` there's no interactive Apple login, so iOS builds can't generate a distribution cert/profile — the App Store Connect API key (`.p8` + Key ID + Issuer ID) is what unblocks non-interactive build + submit.
- **Secret hook gap closed:** added `*.p8` to the PreToolUse block list (was covering `.pem/.key/.p12` but not `.p8`, the exact type used all day).

## What to improve next (see the self-improvement loop)

- Capture each non-obvious fix as a durable learning (memory + this log) so it's never relearned.
- Tighten the loop between "screenshot the running app" and "auto-detect visual drift from the design."

_This log is meant to be appended to. When a session produces a reusable lesson, add it._

## 2026-07-03 — screen-gallery capture session (MacBook sim → docs/screens/)

- **Stale-bundle trap (cost ~1h):** bare `xcrun simctl launch` of the dev client boots a
  **cached JS bundle** — ours was old enough to predate the resilient-couple-lookup fix, so
  every relaunch showed pair-up/"Tap retry" + fallback identity ("Y", streak 0) despite a
  healthy DB/session. Launch with
  `xcrun simctl openurl booted "com.anonymous.parallax://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"`
  (confirm the "Open in parallax?" dialog) to force a fresh Metro bundle. Frontend rule
  updated the hard way.
- **Headless auth without typing:** mint a session via
  `POST /auth/v1/token?grant_type=password` and write the JSON over the AsyncStorage value
  file (`.../RCTAsyncLocalStorage_V1/<md5 of "sb-127-auth-token">`) with the app terminated —
  supabase-js restores it on next launch. (UI typing via cliclick is unreliable for RN buttons.)
- **Sheets stack under deep links:** `(sheets)` routes opened via `parallax://plus|share|spice`
  stay mounted over subsequently deep-linked screens; backdrop taps/drag-down don't dismiss
  them in automation. Relaunch the app to reset the nav stack between sheet captures.
- Deep-linked `parallax://reveal` (no play-flow context) shows the honest error state by
  design — the celebration is only reachable through Today → "See the reveal".
- Full gallery + ASC IAP screenshots now live in `docs/screens/` (see SCREENS.md).

## 2026-07-07 · V2 S1 surfaces (Mac Mini build session)
- **0039's solo API had a blocking bug found while wiring the client:** `start_refocus(p_is_solo=true)`
  inserted the solo row with default state `waiting_partner`, occupying the one-open-per-couple
  partial unique index — one solo session made every two-sided open raise
  `refocus_session_race_unresolved` (the recovery SELECT filters `not is_solo`). It also logged
  to the couple-shared activity feed, leaking the solo session's existence to the partner.
  Fix (0043): solo sessions are created atomically by `save_solo_refocus`, born `revealed`, no
  activity log. Lesson: when a migration documents an invariant ("solo rows are never in the open
  state"), pgTAP-prove the invariant itself, not just the happy path around it.
- **Mac Mini has no iOS simulator runtimes installed** (`xcrun simctl list runtimes` is empty) —
  the screenshot half of the UI verification loop can't run here. V2 S1 surfaces verified via
  typecheck + jest (973) + `expo export` + pgTAP (543); first visual pass must happen on the
  MacBook (or after runtimes are installed) with the flags flipped ON against local supabase.

## 2026-07-15 · v1.0 APPROVED — and the "Removed from App Store" scare
- **v1.0 passed App Review** (email "Ready for Distribution", 14 Jul 8:24 PM SGT) — rejection #2 fixes held.
- **ASC gotcha:** the Apps page then showed "Removed from App Store", which looks like Apple pulled the app. Real cause: review approval and distribution availability are independent gates — App Availability had never been set up (zero territories), and ASC labels that state "Removed from App Store" instead of "not yet available". No rejection/removal email = check Pricing and Availability first.
- Fix: Pricing and Availability → Set Up Availability → All Countries or Regions (175). Status flipped back to "iOS 1.0 Ready for Distribution"; territories show "Processing to Available" (App Store propagation up to 24h).

## 2026-09-20 · TestFlight pass fixes (no build yet — Yash wants all fixes in one binary)
- Shipped: screenshot chat import (expo-image-picker → `schema: 'transcribe'` in the refocus fn, Haiku vision → chat lines, same shape as a paste), Read it as the only capture action, real haptics (Btn tick + success thump on read/copy, persisted toggle), human plan label on Manage Plus, paired card hidden under ONE_SIDE.
- **Bug found by the new test:** `reset()` in OneSideFlow never set step back to capture, so the 40s "Save what you wrote" hatch left the user on the working screen. Fixed.
- **Latency:** prod read measured 12–14s before, 11–13s after running the safety screen concurrently with the read + prompt caching. The floor is Sonnet 5 generating the read; logged as `refocus_v2_timing`.
- **Gotcha:** jest path args with parentheses (`app/(tabs)/...`) are regexes → "No tests found". Use a bare name pattern like `oneSideFlow`.
- **Gotcha:** expo-image-picker is a native module → the existing dev/TestFlight binary crashes on the capture screen until rebuilt. Fast Refresh is not enough.
- **Shipped:** 2.2.0 build 20, commit 989ae07, EAS build 7b838364 with auto-submit to TestFlight (20 Sep 15:44). Yash's decision after a long direction loop: no revamp code, use the app for real for 3 weeks first; the revamp canvas (12 screens) waits on that.
