# Parallax — Master Build Roadmap

> **For agentic workers:** This is the master roadmap. Each phase below has (or will get) its own detailed bite-sized plan in this folder. Build phases in order; each is a shippable vertical slice. Use superpowers:subagent-driven-development or superpowers:executing-plans to implement each phase's plan task-by-task.

**Goal:** Rebuild the Parallax couples-app prototype (in `design_handoff_parallax/`) as a production React Native + Expo app backed by Supabase, end-to-end, pixel-faithful.

**Architecture:** One Expo (TypeScript) app at the repo root using Expo Router for navigation. Supabase (Postgres + Auth + Realtime + Storage + Edge Functions) is the backend; Row-Level Security is the privacy backbone and the reveal gate. All cross-partner writes go through Postgres/edge functions — never trusted to the client. Pure domain logic (scoring, streak math) lives in `src/domain/` and is unit-tested in isolation. UI atoms are faithful ports of the prototype's `couples-core.jsx` component system.

**Tech Stack:** React Native + Expo (SDK 53+), TypeScript, Expo Router, Reanimated, react-native-svg, expo-linear-gradient + @react-native-masked-view/masked-view (gradient text), expo-blur (frosted nav/sheets), @tanstack/react-query + supabase-js (server state), Zustand (local UI state), expo-notifications (push), react-native-purchases (RevenueCat), Claude via Supabase Edge Function (Refocus), PostHog + Sentry. Tests: jest-expo + @testing-library/react-native; Deno test for edge functions; SQL/integration tests for the RLS reveal gate.

## Global Constraints

These apply to every task in every phase. Values are copied verbatim from the handoff.

- **TypeScript everywhere.** No untyped JS in app or edge functions.
- **RLS on every table from day one.** Every intimate table carries `couple_id`; policy = "current user is a member of this couple." Partner answers additionally gated on `couple_drops.state = 'revealed'`.
- **The reveal is server-gated.** A client MUST NOT be able to read the partner's answers until both have submitted. Enforced in RLS + a Postgres function, not the client.
- **Never ship secrets in the client.** Anthropic key, service-role key, RevenueCat secret live only in Supabase Edge Function secrets / server env.
- **Use `npx expo install <pkg>`** for any package with a native component so versions match the installed Expo SDK. Do not hand-pin native deps.
- **Wordmark is `para//ax`** — the "ll" rendered as two parallel slashes (slash 1 = coral `--p1`, slash 2 = periwinkle `--p2`). **Tagline: `mind the parallax error`.** Copy these exactly.
- **Colors (exact):** `--p1 #FF8E7A` / `--p1-deep #EF6A53` (you, coral); `--p2 #9D95F5` / `--p2-deep #7064E6` (them, periwinkle); `--match #54C2A0` / `--match-deep #2E9C7C` (hunch landed, mint); `--ink #3A3340`, `--ink-soft #8B8398`, `--ink-mute #B7B0C2`; `--bg-0 #FBF1F2`, `--bg-1 #F1ECFB`, `--surface #FFFDFD`, `--sunken #F4ECF4`. Gradients & shadows: see `design_handoff_parallax/design_files/Parallax-final.html` lines 11–28.
- **Fonts (exact):** Instrument Serif (display/wordmark/scores), Hanken Grotesk 400–800 (UI/body), Space Mono 400/700 (ALL-CAPS kickers @ 10px / 0.18em, and diagnostic numerals).
- **Safe-area insets, not mock chrome.** The prototype's 390×820 frame, status bar, and home indicator are scaffolding — use `react-native-safe-area-context` for real device insets.
- **No raster assets.** Wordmark, Peek mascot, Mark, icons, ring are all code-drawn (SVG/Views).
- **Reveal scoring is fixed:** `wave = round((yourHunchHits + theirHunchHits) / (promptCount × 2) × 100)`; `twins` = prompts where your pick == their pick. Source: `couples-core.jsx:309-318`.

---

## Source of truth & reference map

The prototype is the visual + copy spec. When building a screen, open its prototype source:

| Production area | Prototype source |
|---|---|
| Tokens, fonts, keyframes | `Parallax-final.html` |
| Atoms, shell, nav, sheet, mascot, wordmark, icons, data models, `reveal()` | `couples-core.jsx` |
| Home, Play, Waiting, Reveal, Packs, Us | `couples-screens.jsx` |
| Onboarding, Profile, PackDetail, DropDetail, Thread, ShareCard, PlusSheet, SpiceSheet | `couples-flows.jsx` |
| WidgetSetup, HomeScreen mock, Wrapped + Couple Type, Streak | `couples-viral.jsx` |
| Activity, Milestone | `couples-activity.jsx` |
| Love Map | `couples-lovemap.jsx` |
| Refocus + Resolution + `analyze()` | `couples-refocus.jsx` |
| Checkout, PlusSuccess, ManageSub, EditProfile | `couples-pay.jsx` |
| Router / screen list / app-state shape | `couples-app.jsx` |
| Recommended stack, schema, build order, growth model | `ARCHITECTURE.md`, `README.md` |

---

## Project structure (target)

```
/                          repo root = Expo app
  app/                     Expo Router routes
    _layout.tsx            root stack + providers (QueryClient, SafeArea, fonts gate)
    index.tsx              redirect → onboarding or (tabs)/today based on auth+pairing
    (onboarding)/          6-step first-run flow
    (tabs)/
      _layout.tsx          frosted tab bar: Today · Refocus · Us
      today.tsx  refocus.tsx  us.tsx
    play.tsx reveal.tsx waiting.tsx packs.tsx packDetail.tsx dropDetail.tsx
    thread.tsx profile.tsx editProfile.tsx checkout.tsx plusSuccess.tsx
    manageSub.tsx lovemap.tsx activity.tsx streak.tsx milestone.tsx
    wrapped.tsx widgetSetup.tsx homeScreen.tsx
    (sheets)/              transparentModal routes: share, plus, spice
  src/
    design/    tokens.ts  typography.ts  fonts.ts
    components/ Icon Mark Wordmark Slashes Peek Ring Tok Press Btn Chip Stat
                GradientText Kick Serif Sheet Toast TopBar Card  (atom ports)
    domain/    reveal.ts  streak.ts  wavelength.ts   (pure, unit-tested)
    features/  auth/ pairing/ drops/ reveal/ streak/ activity/ lovemap/
               refocus/ plus/ growth/   (hooks + data access per slice)
    lib/       supabase.ts  queryClient.ts  analytics.ts  deepLinks.ts
    store/     ui.ts  (zustand: sheet, toast, transient UI)
  supabase/
    migrations/   NNNN_*.sql   (schema + RLS + functions)
    functions/    refocus/  schedule-push/  revenuecat-webhook/   (Deno)
    seed.sql      DROP 27 + packs + archive demo content
  __tests__/ or co-located *.test.ts
  app.json  package.json  tsconfig.json  jest config
  design_handoff_parallax/   (reference, untouched)
```

---

## Phases (each becomes its own detailed plan)

Build order = the handoff's vertical slices. Ship 1–3 to real couples (private beta) before investing in 5–8.

### Phase 0 — Foundation & design system  ▸ detailed plan: `2026-06-21-phase-0-foundation.md`
Expo scaffold, fonts, tokens, the full atom library, the navigation shell (3 tabs + stack + sheet modals), safe-area layout, and the pure `reveal()`/`wavelength` domain logic with tests. **Done when:** app runs on iOS+Android, a component gallery renders every atom pixel-faithfully (gradient text, frosted blur, Peek mascot, wavelength ring, wordmark offset→align animation), and `npm test` passes domain + render tests.
**Service gate:** none.

### Phase 1 — Auth + pairing
`profiles` + `couples` tables + RLS; Supabase Auth (Apple + Google + email); the 6-step Onboarding wired to real auth; create couple → invite code → deep link → partner joins → `status='active'`. **Done when:** two devices pair end-to-end and land on Today.
**Service gate (you provision):** Supabase project (URL + anon + service-role keys); Apple Developer "Sign in with Apple"; Google OAuth client; an iOS/Android deep-link scheme.

### Phase 2 — Daily loop (the product — get it perfect)
`drops`, `drop_prompts`, `couple_drops`, `answers` + RLS reveal gate; Today hero card; Play (pick→hunch state machine, 360ms/220ms auto-advance); submit answers as server rows; Postgres function flips `couple_drops.state` to `revealed` only when both submitted; Waiting gated on partner's real submission via Realtime; Reveal with real scoring + animations. **Done when:** an integration test proves a member cannot read partner answers pre-reveal, and a real couple completes a drop → gated reveal.
**Service gate:** none beyond Phase 1.

### Phase 3 — Notifications (the trigger)
Store `notify_time`/`notify_tz`/`push_token`; a scheduler (Supabase cron → edge function) sends one daily push per couple at their local chosen time; push deep-links into Play. **Done when:** a scheduled push arrives at the chosen time and opens the drop.
**Service gate:** EAS project; Expo push credentials (APNs key, FCM key).

### Phase 4 — Streak + activity
Shared-streak math as Postgres functions (reset if either misses; freeze logic; `freezes_remaining`); `activity` feed table + Realtime red-dot; nudge action. Streak, Milestone, Activity screens. **Done when:** streak increments/resets correctly across both partners (unit-tested math + integration), and activity red-dot clears on open.
**Service gate:** none.

### Phase 5 — Us + Love Map
History (`ARCHIVE`-style real data), wavelength bar chart (last 7 drops), `learnings` auto-created from drops with `mastery`, mastery meter. Us, LoveMap, DropDetail screens. **Done when:** completing drops accrues learnings and the wavelength chart reflects real history.
**Service gate:** none.

### Phase 6 — Refocus (the differentiator)
Two-sided private input (text/voice/paste) → Claude **Supabase Edge Function** (`analyze()` returns `{agree[], angles{you,dani}, underneath{you,dani}, wayback, bridge}`) → Resolution screen → write `learnings` (`source='refocus'`) to close the loop. Private-to-AI; partner only sees the resolution. **Done when:** a real two-sided session produces a resolution and writes both partners' needs to the Love Map.
**Service gate:** Anthropic API key (set as edge-function secret).

### Phase 7 — Monetization
RevenueCat SDK + entitlements; PlusSheet → Checkout (Annual $39.99 / Monthly $4.99, Apple Pay/Card) → PlusSuccess → ManageSub; packs (Deep end free, rest Plus); RevenueCat webhook → `couples.plus`; entitlement propagates everywhere (packs unlock, banners, sendable locked detail). **Done when:** a sandbox purchase flips `couples.plus` via webhook and unlocks content for both partners.
**Service gate:** RevenueCat account; App Store Connect + Google Play products; sandbox testers.

### Phase 8 — Growth surfaces
Wrapped (6-slide tap-through story + Couple Type archetype), ShareCard sheet + native share, Milestone celebration, WidgetSetup, and a **real** WidgetKit (iOS) / Glance (Android) wavelength + tap-to-ping widget. Plus PostHog funnels (D1/D7, 7-day-streak survival, reveal-completion, invite→activation) and Sentry. **Done when:** Wrapped is shareable, the home-screen widget shows live wavelength, and core funnel events fire.
**Service gate:** PostHog project; Sentry DSN; widget entitlements (config plugin + dev build).

---

## Testing strategy

- **Domain logic** (`src/domain/`): pure Jest unit tests, exact expected values. `reveal()` scoring, streak transitions, wavelength aggregation, Couple-Type classification. These are the highest-ROI tests.
- **Components**: `@testing-library/react-native` render + interaction tests for stateful atoms (Press, Btn, the Play option machine, Sheet open/close). Snapshot only token-level styling, not whole screens.
- **The reveal gate** (the one integration test the handoff insists on): seed two members, submit one side, assert the other side's `answers` are NOT selectable until both submit and state flips. Run against a local Supabase.
- **Edge functions**: Deno tests with the Claude call mocked; assert the JSON contract shape.
- **CI-friendly**: no device/browser needed for unit/integration; widget + payment flows verified manually on a dev build.

## Self-review against the spec (roadmap level)

Every README screen maps to a phase: Onboarding→P1; Home/Play/Waiting/Reveal→P2; Notifications→P3; Streak/Milestone/Activity→P4; Us/LoveMap/DropDetail/Thread→P5 (Thread rides on Reveal from P2, finished in P5); Refocus/Resolution→P6; Packs/PackDetail/PlusSheet/Checkout/PlusSuccess/ManageSub/Profile/EditProfile/SpiceSheet→P7 (Profile/EditProfile/Spice are settings, built alongside P7 or pulled earlier if needed); Wrapped/ShareCard/WidgetSetup/HomeScreen→P8. Foundation atoms + reveal scoring→P0. The four growth mechanics (trigger/intent/shared-streak/share-at-peak) land in P3/P1/P4/P8 respectively.
