# Catchline

An iOS/Android app (React Native + Expo) for Olympic lifters and CrossFit athletes: film or import one side-on lift, get the bar path, the phases and **one cue** back, then track whether the cue stuck. It ships in the old **Parallax** App Store record (bundle id `com.yashgadodia.parallax`, EAS slug `parallax`, projectId `5404ebf0-…`; never change those). Parallax lives on at tag `parallax-final`, branch `archive/parallax` and `docs/archive/parallax/`.

Design source of truth: `~/dev/liftcheck-research/design/` (`Catchline Design System.dc.html`, `Catchline 02`..`09`). Plan and notes: `TASKS.md`. Backend: `docs/catchline/BACKEND_SETUP.md`. Store products: `docs/catchline/PRODUCTS.md`.

## Commands
- **Install**: `npm install --legacy-peer-deps`
- **Run**: `npx expo run:ios` (debug build; Expo Go cannot run this repo) · **Bundle check**: `npx expo export -p ios`
- **Test**: `npx jest` · **Typecheck**: `npm run typecheck`
- **Backend (Mac Mini only)**: see BACKEND_SETUP "Local run"; `supabase test db`, worker `uv run pytest`

## Stack
- Expo SDK 56, RN 0.85, React 19, TypeScript, Expo Router (`app/`), Zustand, Reanimated 4, react-native-svg, RevenueCat
- Supabase (Postgres + RLS + Storage TUS + Realtime + pgmq/pg_cron); Python CV worker (`cv/`, `worker/`), Modal for prod
- `src/analysis/types.ts` is the Analysis contract shared by app, CV and worker

## Data flow
- One switch: `EXPO_PUBLIC_SUPABASE_URL` + `ANON_KEY` set → repositories use `src/lib/api` (Supabase); unset → local fixture stores (dev mode). `src/data/backend.ts` owns it.
- Analyse: `nextClipGate()` → consent (`syncConsent`) → `createLift` + TUS upload → `/analysis/processing?live=1` follows the lift over Realtime → reveal → cue. Failure → `/failure/[id]`. `routeAfterAnalysis()` sends the ad funnel to its trial.
- The app signs in anonymously (no sign-in screen yet). Local secrets go only in gitignored `.env.local`.

## Invariants
- **RN fidelity** (`.claude/rules/frontend.md`): `lineHeight` in px, explicit `color` on every `<Text>`, reuse `src/components` atoms and `src/design` tokens.
- **Design rules beat the design file**: monochrome plus flare `#FF3B2F` only; no pill buttons (56pt, 4px radius); "Bar drift at hip"; the cue is labelled "AI estimate"; never "prevent injury" or "diagnose".
- **Privacy**: raw clips are write-only for the client and deleted after analysis (24 h backstop); never log or store a clip elsewhere; consent before the first upload; caps, consent and job state are enforced server-side, never trust the client.
- Realtime needs the table in `supabase_realtime`; supabase-js `never` inference → documented `// @ts-expect-error`, never `as any`.
- No `any` / `@ts-ignore`. Keep it simple, no drive-by refactors.

## Testing
- Co-located `*.test.ts(x)`, exact assertions, real `render()` (`.claude/rules/testing.md`). Global mocks in `jest-setup.ts`; API tests mock `src/lib/supabase`.
- Done = `npm run typecheck` 0 + `npx jest` green + `npx expo export -p ios` 0, and a simulator screenshot for UI.

## Machines and git
- **Docker and `supabase start` run only on the Mac Mini** (`ssh mini`, `export PATH=/opt/homebrew/bin:$PATH`; Catchline stack on ports 554xx). Never on the laptop.
- Work on branch `catchline` (or a worktree branched from it). Never commit to `main` (Parallax). Conventional Commits; never push unless asked.
- **Public repo**: never commit credentials (`.env*`, service keys, tokens). See `.claude/rules/secrets.md`.
