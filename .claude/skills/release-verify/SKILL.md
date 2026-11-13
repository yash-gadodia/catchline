---
name: release-verify
description: What must be watched working before a Catchline OTA update or store build ships, and what the release report must say. Use before `scripts/ota.sh publish`, before `scripts/store-build.sh` or any EAS build or submit, before telling the owner something is "ready to ship", and after any change to tracking, the camera, the clip transcoder or native code. Triggers on OTA, publish, store build, TestFlight, submit for review, release, ship 4.x, "is it ready".
---

# Release verify

On 11 Nov 2026 a build passed typecheck, 900 unit tests, the design guards and the bundle export, went to App Review, and still drew the bar path on the plate in 2 of the owner's 11 phone clips and crashed natively. Green checks prove the code compiles and agrees with its own tests. **A release is verified when someone has watched the behaviour work on real clips and on the real app.** Do every step below yourself, in order; do not infer a step from another step passing. A step you could not do is reported as NOT VERIFIED, never left out.

## 1. The real-clip gate (every release)

`scripts/eval31/gate.sh` runs the owner's clips (`scripts/eval31/gate-clips.json`) on the Mac Mini through the phone's own pipeline: the app's transcoder code prepares each clip (1080 long edge, SDR), the pose harness and `trackTrace` track it, and each row is compared with `gate-baseline.json`.

- `scripts/eval31/gate.sh --needed` says what this commit needs: `full`, `replay` or `none`.
- Native code, the transcoder, the encode plan or the gate itself changed: `--check` (15-25 min; it waits while the Mini's load is above 8, one clip at a time).
- Only TS rules under `src/analysis/` changed: `--replay` (seconds, on the baseline's saved traces). If it says the rules ask for reads the trace lacks, run `--check`.
- It fails on: a clip that loses its plate path, plate share down more than 10 points, a clip that tracked and now fails, joints seen down more than 3 points, the share of hand-labelled plate frames with the path within 0.25 plate radii (`L` in the table) down more than 10 points, a bar path on a no-barbell clip, a crash.
- Then **look**: `scripts/eval31/gate.sh --sheets check` (or `baseline`) and Read every `.gate/sheets/<id>.jpg`. The red path must sit on the plate through the lift, the body lines on the lifter, nothing drawn on the pull-up and wall-walk clips. Numbers passing with a path drawn on the wrong object is a failure; say which clip.
- A real improvement becomes the baseline with `--record` on the commit, then commit `gate-baseline.json`. Never re-record to make a regression pass. Never commit clips, frames or sheets (public repo; `.gate/` is ignored).
- `GATE_SKIP="<reason>"` exists for an emergency rollback-forward only. Using it is the owner's decision, not yours; the report must quote the reason.

## 2. Before an OTA update

1. The gate, as above, on the exact commit being published (clean tree).
2. Every changed screen, on the simulator, from pixels: `.claude/skills/design-review` section 1 to get your build up, then screenshot each changed state and Read the image. For a tracking change, open a tracked lift in the player (`catchline://analysis/player?fixture=<id>`, TASKS.md notes) and scrub it.
3. `scripts/ota.sh publish "<msg>"` without `--go` first; read what it prints. Publishing with `--go` needs the owner's go.
4. After publishing, ask the update server what each runtime gets, not EAS's exit code: `scripts/ota.sh live` for the current runtime, and the same request with `expo-runtime-version` set to every other runtime still in use (3.1.1 today). Report the update id per runtime, and confirm older runtimes did not move.

## 3. Before a store build

1. `scripts/store-build.sh`: full gate on the build's commit (a replay is not enough), `npm run qa`, then it prints the EAS commands. It runs none of them.
2. **Simulator, Release configuration** (`npx expo run:ios --configuration Release` on your own simulator udid; a debug build hides launch crashes and uses Metro). Fresh install, then watch each step and screenshot it: first launch and onboarding; pick a video; trim; mark the plate; track to the result; the player opens and plays with the path; share a video from the share sheet. Read every screenshot. Any red box, blank screen, stuck spinner or crash stops the release.
3. **A real phone, by the owner, on TestFlight**, for anything touching the camera, tracking speed or native code. Ask for exactly this and record the answers: one clip filmed at 60 fps, one landscape clip, one clip over 20 seconds, each tracked to a result and played; quit the app mid-track and reopen it; share one video. You cannot do this step. Until the owner answers, it is NOT VERIFIED.
4. **Crash reports afterwards**: App Store Connect / Xcode Organizer crashes for the build, and Sentry or PostHog `$exception` if their keys are set in the EAS production env. Zero new crash signatures, or name them.
5. **One day on internal TestFlight** before submitting for review, unless the owner says otherwise in this conversation. Submitting for review, release and phased rollout are the owner's go, every time.
6. After the build exists: record it in `scripts/store-build.json`.

## 4. The report

Lead with anything NOT VERIFIED and what would verify it. Then:

- Commit, version and runtime; what the gate needed and which mode ran; the gate table (clip, baseline, now, verdict); any override and its reason.
- What you looked at: sheets (which clips, what you saw), simulator screenshots (paths), with anything odd named.
- OTA: update group id and what each runtime receives. Store build: build number, the phone pass answers, crash report check, the TestFlight day.
- Never write "works", "ready" or "verified" for a step you did not watch.
