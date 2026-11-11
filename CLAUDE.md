# Catchline

An iOS/Android app (React Native + Expo) for Olympic lifters and CrossFit athletes: film or import a lift, and the phone tracks the barbell plate and the body's joints and plays them back on the real video, every frame (4.0: tracking only, no cues). It ships in the old **Parallax** App Store record (bundle id `com.yashgadodia.parallax`, EAS slug `parallax`, projectId `5404ebf0-…`; never change those). Parallax lives on at tag `parallax-final`, branch `archive/parallax` and `docs/archive/parallax/`.

Design source of truth: `~/dev/liftcheck-research/design/` (`Catchline Design System.dc.html`, `Catchline 02`..`09`). Plan and notes: `TASKS.md`. Backend: `docs/catchline/BACKEND_SETUP.md`. Store products: `docs/catchline/PRODUCTS.md`.

## Commands
- **Install**: `npm install --legacy-peer-deps`
- **Run**: `npm run pose-models` once (bundles the Core ML models, ~150 MB, gitignored), then `npx expo run:ios` (debug build; Expo Go cannot run this repo) · **Bundle check**: `npx expo export -p ios`
- **Test**: `npx jest` · **Typecheck**: `npm run typecheck`
- **Backend (Mac Mini only)**: see BACKEND_SETUP "Local run"; `supabase test db`, worker `uv run pytest`

## Stack
- Expo SDK 56, RN 0.85, React 19, TypeScript, Expo Router (`app/`), Zustand, Reanimated 4, react-native-svg, RevenueCat
- Supabase (Postgres + RLS + Storage TUS + Realtime + pgmq/pg_cron); Python CV worker (`cv/`, `worker/`), Modal for prod
- `src/analysis/types.ts` is the Analysis contract shared by app, CV and worker

## Data flow
- One switch: `EXPO_PUBLIC_SUPABASE_URL` + `ANON_KEY` set → repositories use `src/lib/api` (Supabase); unset → local fixture stores (dev mode). `src/data/backend.ts` owns it.
- Track (4.0): camera or import → `/capture/trim` (trim, optional load, Track) → `nextClipGate()` → `startLift` → `/analysis/processing?live=1` → `/analysis/player` (`TrackerScreen` for a lift with a kept clip, the stills `PlayerScreen` for a 3.x lift). Failure → `/failure/[id]`. No movement picker, cues, trends or retests; two tabs (Lifts, You).
- On the phone (`src/data/devicePipeline.ts`): `prepareClip` (H.264, long edge 1080, Rec. 709; `modules/clip-transcoder`) → pose and plate passes on the prepared clip (`modules/pose-coreml`, three at most) → `trackTrace` (`src/analysis/device`) → `analysis.json`, `body.json` and `clip.mp4` kept with the lift. Only the lift record syncs to Supabase; the server worker is retired (0023).
- The app starts anonymous; the You tab offers Sign in with Apple (a purchase asks for it first) (`src/features/auth/appleSignIn.ts`; an anonymous account's rows move over through `begin/complete_account_transfer`, 0006). Local secrets go only in gitignored `.env.local`.

## Invariants
- **RN fidelity** (`.claude/rules/frontend.md`): `lineHeight` in px, explicit `color` on every `<Text>`, reuse `src/components` atoms and `src/design` tokens.
- **Design system**: read `.claude/skills/catchline-ui` before any UI work; `src/design` is the only source of values, `catchline://dev/design` shows every token and atom.
- Review UI on the simulator with `.claude/skills/design-review`; the design guards in `npm run check` hold each file to its count in `scripts/design-baseline.json`.
- **Design rules beat the design file**: monochrome plus flare `#FF1F3D` only; no pill buttons (56pt, 4px radius); results are labelled "AI estimate"; never "prevent injury" or "diagnose".
- **Privacy**: a clip is tracked on the phone and stays there (deleted with its lift). The one upload is the user's own "Send this clip" on a failed lift (`shared-clips`, purged after 30 days). Never log or store a clip elsewhere; RLS is owner-only, never trust the client.
- Realtime needs the table in `supabase_realtime`; supabase-js `never` inference → documented `// @ts-expect-error`, never `as any`.
- No `any` / `@ts-ignore`. Keep it simple, no drive-by refactors.
- **OTA safety**: every OTA reaches every binary on runtime `expo.version`, so no native change (native package version, `modules/`, `app.json`) lands without a version bump. `scripts/check-native-surface.ts` (in `npm run check`) diffs against the store build in `scripts/store-build.json`; update that file after each store build.
- **OTA releases** go through `scripts/ota.sh publish "<msg>" [--rollout N] --go` (checks, the eas.json env block, live manifest check) and `scripts/ota.sh rollback <group> --go`; without `--go` it is a dry run.

## Release (read `.claude/skills/release-verify` before any OTA or store build)
- **Tracking changes are done when the gate passes on the owner's clips and the overlays have been looked at, not when tests pass.**
- `scripts/eval31/gate.sh --check` (Mini, 15-25 min) runs the clips in `gate-clips.json` prepared and tracked as the phone does it, against `gate-baseline.json`; `--replay` (seconds) is enough for TS-only rule changes; `--sheets` fetches the overlays to look at.
- `scripts/ota.sh publish` and `scripts/store-build.sh` refuse without a passing gate result for the commit. `GATE_SKIP="<reason>"` is the emergency override; it is logged and lands in the update message.
- `npm run deadcode` (knip) is a report, not a gate.

## Testing
- Co-located `*.test.ts(x)`, exact assertions, real `render()` (`.claude/rules/testing.md`). Global mocks in `jest-setup.ts`; API tests mock `src/lib/supabase`.
- Done = `npm run typecheck` 0 + `npx jest` green + `npx expo export -p ios` 0, and a simulator screenshot for UI.

## Machines and git
- **Docker and `supabase start` run only on the Mac Mini** (`ssh mini`, `export PATH=/opt/homebrew/bin:$PATH`; Catchline stack on ports 554xx). Never on the laptop.
- Work on branch `catchline` (or a worktree branched from it). Never commit to `main` (Parallax). Conventional Commits; never push unless asked.
- **Public repo**: never commit credentials (`.env*`, service keys, tokens). See `.claude/rules/secrets.md`.
