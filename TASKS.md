# Catchline: first slice

Goal: the Analysis flow running in the iOS simulator on real measurements from one of Yash's own lifts. Branch `catchline`. Parallax is preserved at tag `parallax-final` and branch `archive/parallax`.

Design source: `~/dev/liftcheck-research/design/` (Claude Design export; `Catchline Design System.dc.html`, `Catchline 04 Analysis.dc.html`, `exports/04-analysis/*.png`). Research: `~/dev/liftcheck-research/SYNTHESIS.md`.

## Track A: UI slice (app)
- [x] Strip Parallax product screens/features from the branch; keep auth, RevenueCat wiring, EAS/OTA config, shared infra
- [x] Strobe tokens (colours, type scale, radii, spacing) + fonts (Big Shoulders Display, Schibsted Grotesk, Sometype Mono)
- [x] Analysis JSON contract (`src/analysis/types.ts`) shared with the CV spike
- [x] Processing sheet (in progress, long wait, done)
- [x] Result reveal (strobe pops, path draw, dimension line, cue type-in, haptics, Reduce Motion)
- [x] Cue screen + "why this" drawer
- [x] Player (4:5 stage, path overlay, phase chips, scrubber with phase ticks, jog wheel, speed, overlay toggles)
- [x] Compare (ghost, side by side), low confidence, why did I miss
- [x] typecheck + tests green; simulator screenshots of every state vs design

### Track A notes (11 Oct)
- Run it: `npm run ios` builds the debug app (`expo run:ios`); Expo Go cannot run this repo (reanimated 4.5 / worklets 0.10 vs Expo Go SDK 56's 4.3.1 / 0.8.3, pre-existing). The dev entry at `/` opens every state; deep links work too, e.g. `parallax://analysis/player?frame=446`, `parallax://analysis/cue?fixture=snatch-mock-low`.
- Fixtures: `src/analysis/fixtures/snatch-mock.json` (bar-end trace measured by eye on the 7 real frames, so the path sits on the far plate). Low-confidence, miss and compare targets are derived in `fixtures/index.ts`. To load the CV output, drop `snatch-real.json` next to it and add one line to `ANALYSES`; `parseAnalysis` rejects pixel (non-normalised) traces.
- v1 "video" is the keyframe image sequence (`asset:` ids in `KeyFrame.image`, resolved by `src/analysis/frames.ts`; any other string is used as a uri). `Stage` is the seam for a real expo-video surface.
- Join note: `snatch-real.json` parses, but its `KeyFrame.image` values are repo-relative paths (`assets/analysis/snatch-real/r1-1-setup.jpg`), which RN cannot load as a uri. Register them in `src/analysis/frames.ts` (bundled `require`s, keyed as `asset:snatch-real/r1-1-setup`) and emit those ids, then add the fixture to `ANALYSES`.
- Contract unchanged. Assumption the CV side should match: `pxPerCm` is in the same pixel space as `video.width`, and the lifter faces +x (signed compare deltas use it).
- Not built: 4c landscape (app is portrait-locked), 4e skeleton, 4f overflow sheet, 4g move markers, 5c compare empty, 7 gymnastics result (needs a bar MU fixture + hip trace). `···` is inert.
- Left for later: `supabase/` migrations, `src/types/db.ts`, `targets/widget` + `modules/parallax-live-activity` (native Parallax widget), app.json name/bundle id/scheme, CLAUDE.md/ARCHITECTURE.md/docs still describe Parallax, auth UI screens (login/callback) were removed with the product; `authActions`/`useSession` remain.

## Track B: CV spike (runs on the Mini)
- [x] `cv/` pipeline: RTMPose (Apache) + plate tracking (no Ultralytics/AGPL) on a real clip
- [x] Phase segmentation + metrics + rule for "hips rise early" / bar drift
- [x] Emits the Analysis JSON contract
- [ ] Run on Yash's snatch clip; output committed as a fixture the UI loads

## Join
- [ ] UI renders the spike's real JSON for Yash's snatch
