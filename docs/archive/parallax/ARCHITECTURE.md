# Parallax — Architecture

## Overview
Parallax is a two-person (couples) mobile app. The daily ritual: both partners get the same 3-prompt "drop," each answers for themselves and places a *hunch* on their partner; once both submit, a **server-gated reveal** scores their "wavelength." Refocus (AI conflict mediation) and a shared Love Map feed the same compounding loop. Built from the prototype in `design_handoff_parallax/` onto a React Native + Expo + Supabase stack.

## System Map
```
Expo Router app (app/)                Supabase (Postgres + Auth + Realtime)
  screens ──> src/features/* hooks ──>  RPC (SECURITY DEFINER fns) + RLS
   │            (auth, pairing,           │   profiles, couples, drops,
   │             drops, engagement,       │   drop_prompts, couple_drops,
   │             lovemap, onboarding)     │   answers, activity, learnings
   ├─ src/components  (design-system atoms)
   ├─ src/design      (tokens, typography)
   ├─ src/domain      (pure logic: reveal scoring, mood — unit-tested)
   ├─ src/store       (Zustand: UI, play state)
   └─ src/content     (drop/us/extras/pay/refocus seed data)
```

## Directory Structure
- `app/` — Expo Router routes: `(onboarding)`, `(tabs)` (Today/Refocus/Us), `(sheets)` (transparent modals), + stack screens (play, reveal, packs, profile, checkout, …), `login.tsx`.
- `src/components/` — pixel-faithful atom library ported from the prototype (Btn, Press, Chip, Tok, Peek mascot, Wordmark/Slashes, Ring, GradientText, Icon, Sheet, Toast, TopBar, Card, DawnBlobs, Float, TabBar).
- `src/design/` — `tokens.ts` (colors/gradients/shadows/radius/space), `typography.ts`, `fonts.ts`.
- `src/domain/` — pure, RN-free, unit-tested: `reveal.ts` (wavelength scoring), `wavelength.ts` (mood), `inviteCode.ts`.
- `src/features/` — data layers per slice: `auth`, `pairing`, `drops`, `engagement`, `lovemap`, `onboarding`.
- `src/lib/` — `supabase.ts` (typed client, env-driven), `queryClient.ts`. `src/types/db.ts` — hand-written `Database` types.
- `supabase/` — `migrations/0001..0005`, `tests/*.sql` (pgTAP), `config.toml`.

## Data Flow (daily loop)
Today → Play (pick + hunch ×3) → `submitMyAnswers` → `submit_answers` RPC persists rows → reveal gate: RLS hides the partner's answers until `couple_drops.state='revealed'` (both submitted) → Waiting gates on realtime/poll → Reveal reads the now-revealed answers and runs `scoreReveal`. Solo/demo: `sim_partner_submit` fills a demo partner so a full reveal is testable alone; screens fall back to local Zustand state when there's no session.

## Key Design Decisions
- **Expo Router** (file-based) — every prototype screen maps to a route; sheets are `transparentModal`.
- **RLS is the privacy backbone + reveal gate** — partner data is unreadable pre-reveal, enforced in Postgres (pgTAP-proven), not the client. All cross-partner writes go through SECURITY DEFINER functions.
- **Pure domain logic** isolated in `src/domain` for exact-value unit tests (highest-ROI tests).
- **Pixel-faithful port** of a web prototype → strict RN adaptations (see `.claude/rules/frontend.md`).

## Module Boundaries
Screens never call supabase directly for cross-partner writes — they go through `src/features/*` hooks → RPCs. UI/transient state in Zustand (`src/store`); server state via supabase-js (+ react-query where used); realtime via supabase channels (activity feed, reveal unlock, "Dani played" pulse).

## External Dependencies
- **Supabase** — URL + anon key via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`.env`, gitignored). Local dev via `supabase start` (default ports). Service-role key never in the client.
- **Gated / not yet wired** (UI built, stubbed behind `// GATE:`): Anthropic (Refocus AI edge fn), RevenueCat (payments), EAS + APNs/FCM (push), native WidgetKit/Glance (home widget).

## Entry Points
`app/index.tsx` (auth/pairing gate → onboarding or `(tabs)/today`) · `app/_layout.tsx` (providers + fonts gate) · `app/(tabs)/_layout.tsx` (tabs + floating TabBar overlay) · `src/lib/supabase.ts` (backend client) · `supabase/migrations/` (schema).
