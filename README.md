# Catchline

Film or import one side-on video of a lift. Catchline sends back the bar path, the phases of the lift and one coach-style cue. The next time you lift, it tells you whether the cue stuck.

Built for Olympic weightlifters and CrossFit athletes. iOS first. Pre-launch; early access soon.

Movements the CV pipeline handles today: snatch, clean, jerk, kipping pull-up, bar muscle-up and kipping handstand push-up.

## How it works

1. The app asks for consent on first run, then uploads the clip to Supabase Storage with a resumable TUS upload. Clips are compressed on-device first (`modules/clip-transcoder`).
2. A database RPC enqueues a job on a `pgmq` queue. A Python worker on a Mac Mini claims it.
3. The worker runs `cv/catchline_cv`: ffmpeg decode, RTMPose body-and-feet pose on every frame, lifter selection, camera-motion stabilisation, barbell tracking from the wrist midpoint cross-checked against plate detection, then phase detection (lift-off, double knee bend, turnover, catch, recovery).
4. Coach-written rules in `cv/catchline_cv/rules.py` score each fault (for example "hips rise early", "bar forward off hips", "jump forward"). The most severe fault wins and its cue comes from a fixed cue library in the same file, each under eight words. There is no language model in the loop.
5. The worker writes the analysis and keyframes back, deletes the raw clip, and the app follows the lift over Supabase Realtime to show the reveal and the cue. The cue is labelled "AI estimate" in the app.
6. Cues are remembered per fault, so the next lift with the same movement reports whether the fault came back.

A lifter can also share a 14-day coach link (`web/coach`) so a coach can review the analysis and leave feedback without an account.

## Stack

- App: Expo SDK 56, React Native 0.85, React 19, TypeScript, Expo Router, Zustand, Reanimated 4, react-native-svg, RevenueCat
- Backend: Supabase (Postgres with RLS, Storage with TUS, Realtime, pgmq, pg_cron, pg_net), Edge Functions in `supabase/functions`
- CV and worker: Python 3.11 or 3.12, uv, rtmlib (YOLOX + RTMPose, ONNX on CPU), ffmpeg
- `src/analysis/types.ts` is the Analysis contract shared by the app, the CV package and the worker

## Repo layout

```
app/                 Expo Router routes
src/                 app code: analysis contract, components, design tokens, features, data, API client
cv/                  catchline_cv: pose, tracking, phases, rules, bystander blur; eval and tests
worker/              catchline_worker: pgmq job loop around catchline_cv; modal_app.py is not deployed
supabase/            migrations, pgTAP tests, Edge Functions, local config
modules/             clip-transcoder, a local Expo module for on-device compression
web/coach/           the static coach review page
scripts/             dev, doctor, QA gate and check-* guards
docs/catchline/      BACKEND_SETUP.md, PRODUCTS.md, STORE_REPLACEMENT.md
bot/                 the autonomous bug loop; lives on branch catchline-bot, not here
```

## Development

App, on a Mac with Xcode:

```sh
npm install --legacy-peer-deps
npx expo run:ios        # debug build; Expo Go cannot run this repo
npm run check           # every scripts/check-*.ts guard over src/ and app/
npm run qa              # typecheck, checks, jest, expo export, in that order
```

With `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` unset, the app runs against local fixtures and needs no backend. Local secrets go in a gitignored `.env.local`; never commit credentials to this public repo.

Backend: `supabase start`, the pgTAP suite, the worker tests and the end-to-end script all run on a Mac Mini, never on the laptop. The steps are in `docs/catchline/BACKEND_SETUP.md` under "Local run". The hosted project and the always-on worker are described in the same file.

## Privacy

- Consent is recorded before the first upload, and the consent screen says what happens to the clip.
- Raw clips are write-only for the client: Storage policy allows the upload and nothing else, and nobody can read a raw clip back.
- The worker deletes the raw clip as soon as the analysis is written. A pg_cron job purges anything older than 24 hours as a backstop, and every deletion is audited.
- Only positions are measured, not faces. People in the background are blurred from body pose alone; there is no face detector.
- The cue is an estimate of technique, not medical advice. Catchline makes no diagnosis and no injury-prevention claim.
- Caps, consent and job state are enforced server-side.

## Autonomous bug loop

Branch `catchline-bot` holds `bot/` and `docs/catchline/BOT_LOOP.md`. Two headless Claude Code runs on a Mac Mini take turns: a tester black-box tests the Release build in a simulator and the public API as an anonymous client, then files GitHub issues under the `bot:*` labels; a fixer picks up open issues, fixes them test-first on a `bot/fix-*` branch, runs the gate and opens a PR into `catchline`. Neither merges, pushes to `catchline` or deploys. Security findings are never posted publicly.

## Status

Pre-launch. The backend is hosted, the worker is live and TestFlight builds exist. Early access soon.

Catchline ships in the App Store record that previously held Parallax, a couples app that this repo used to be. Parallax is preserved at tag `parallax-final` and branch `archive/parallax`, with its docs in `docs/archive/parallax/`. The default branch `main` still holds it; all Catchline work is on `catchline`.

## Contributing

Issues are welcome. Open pull requests against the `catchline` branch, not `main`. CI runs typecheck, the check guards and the test suite on a self-hosted runner, so pull requests from outside the repo wait for a maintainer to approve the workflow run before it starts. Keep changes small and on topic, follow Conventional Commits, and do not commit credentials.
