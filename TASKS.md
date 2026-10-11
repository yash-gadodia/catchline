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
- Run it: `npm run ios` builds the debug app (`expo run:ios`); Expo Go cannot run this repo (reanimated 4.5 / worklets 0.10 vs Expo Go SDK 56's 4.3.1 / 0.8.3, pre-existing). The dev entry at `/` opens every state; deep links work too, e.g. `catchline://analysis/player?frame=446`, `catchline://analysis/cue?fixture=snatch-mock-low`.
- Fixtures: `src/analysis/fixtures/snatch-mock.json` (bar-end trace measured by eye on the 7 real frames, so the path sits on the far plate). Low-confidence, miss and compare targets are derived in `fixtures/index.ts`. To load the CV output, drop `snatch-real.json` next to it and add one line to `ANALYSES`; `parseAnalysis` rejects pixel (non-normalised) traces.
- v1 "video" is the keyframe image sequence (`asset:` ids in `KeyFrame.image`, resolved by `src/analysis/frames.ts`; any other string is used as a uri). `Stage` is the seam for a real expo-video surface.
- Join note: `snatch-real.json` parses, but its `KeyFrame.image` values are repo-relative paths (`assets/analysis/snatch-real/r1-1-setup.jpg`), which RN cannot load as a uri. Register them in `src/analysis/frames.ts` (bundled `require`s, keyed as `asset:snatch-real/r1-1-setup`) and emit those ids, then add the fixture to `ANALYSES`.
- Contract unchanged. Assumption the CV side should match: `pxPerCm` is in the same pixel space as `video.width`, and the lifter faces +x (signed compare deltas use it).
- Not built: 4c landscape (app is portrait-locked), 4e skeleton, 4f overflow sheet, 4g move markers, 5c compare empty, 7 gymnastics result (needs a bar MU fixture + hip trace). `···` is inert.
- Left for later: `supabase/` migrations, `src/types/db.ts`, auth UI screens (login/callback) were removed with the product; `authActions`/`useSession` remain.

## Track B: CV spike (runs on the Mini)
- [x] `cv/` pipeline: RTMPose (Apache) + plate tracking (no Ultralytics/AGPL) on a real clip
- [x] Phase segmentation + metrics + rule for "hips rise early" / bar drift
- [x] Emits the Analysis JSON contract
- [x] Run on Yash's snatch clip; output committed as a fixture the UI loads (cee8b2f)

## Join
- [x] UI renders the spike's real JSON for Yash's snatch (dev entry "Real CV · cue")

## Integration (catchline-integrate)
- [x] Identity: display name Catchline, scheme `catchline`, Catchline permission copy; bundle id, package, slug, EAS projectId and updates URL unchanged (same App Store record). Parallax widget target + live-activity module removed; Parallax docs in `docs/archive/parallax/`
- [x] Monogram "C" (from `~/dev/liftcheck-research/brand/`): app icon, Android adaptive foreground, splash mark on black, web favicon; `src/components/Mark` (static + launch draw after the native splash, Reduce Motion aware). Flare is now signal red `#FF1F3D` (light `#D90F2D`)
- [x] One data source: Supabase via `src/lib/api` when `EXPO_PUBLIC_SUPABASE_*` is set, local fixtures otherwise (`src/data/`)
- [x] Analyse → paywall gate → consent → createLift + TUS → live processing → reveal/cue on the real Analysis; failure and cap routes; usage recorded; `routeAfterAnalysis()` on leaving the cue
- [ ] Founding seats counter: no backend table/RPC yet (`getFoundingSeats()` is still the local 137-of-500 stub; PRODUCTS.md "Founding seat counter")
- [ ] Settings stay on-device (no settings table); usage gate reads the local counter, the server cap is authoritative and a `cap_reached` from `create_lift` opens the paywall
- [ ] Trim and rep choice are not sent to the backend (the worker analyses the whole clip)
- Notes: local smoke needs `enable_anonymous_sign_ins = true` (in `supabase/config.toml`; restart the stack after changing it) and the worker running (`uv run python -m catchline_worker`). The app reaches the Mini at `http://yash-mac-mini:55421` (Tailscale) through `.env.local`.

## Goal: a fully working Catchline 3.0 on TestFlight (11-10-2026)
- [x] Integration (merged): real flow capture → paywall gate → upload → processing → cue; rename to Catchline; signal red #FF1F3D; C monogram icon + launch animation (agent, worktree parallax-integrate)
- [x] Hosted backend: Parallax Supabase project slowxjhvrdswdabjfydk wiped and reset to Catchline (Singapore); 109/109 pgTAP; anonymous auth
- [x] Worker: always-on launchd service on the Mac Mini against the hosted project (Modal later)
- [ ] CV v2: clean, jerk, kipping pull-up, bar muscle-up, kipping HSPU; bystander blur (agent, worktree parallax-cv2)
- [x] ASC: version 3.0 created; name "Catchline: Lift Form Check" (en-GB)
- [x] ASC: Catchline subscription group + Hook/Pull/Platform (+ trial variants) + Founding lifetime (review screenshots still needed)
- [x] RevenueCat: project renamed Catchline; entitlements hook/pull/platform/founding
- [x] RevenueCat: 9 products imported and attached; offerings `default` (7 Catchline packages) and `ad_trial` (2 trial packages)
- [x] Clip compression before upload (50 MB free-plan cap): 58 MB → 12.4 MB, fps kept
- [x] Mobbin P0 polish merged (29d3219)
- [ ] app.json version 3.0 (done 6c1d236); EAS env vars; `eas build -p ios --profile production` + submit to TestFlight
- [ ] Smoke test on Yash's phone via TestFlight: onboarding → film/import → real cue

## Polish pass (catchline-polish, 11 Oct)
- [x] Mobbin P0 + S-effort P1 (27-mobbin-fitness, 28-mobbin-polish): baseline sentence, sample lift, last-free heads-up, chip fades, player toggles low, signed compare deltas, Lifts headline number, Trends recap + cue markers, small-text contrast
- [ ] (Claude) Deferred, capture path owned elsewhere: import rep filmstrip (27 #3, 28 #32), capture failure wrong/right frames (27 #4), upload first-frame backdrop (28 #4, needs a clip thumbnail), Import `Cancel` underline (28 #33)
- [ ] (Dani) Design-led: cue check before reveal (27 #7), coach-link disclosure + flags (27 #9), merge the tier table into the paywall sheet (27 #10; plans + founding are already one sheet), low-confidence copy template (28 #23, CV copy)
- Note: `userInterfaceStyle: dark` needs a native rebuild before the photo picker turns dark. Never run `npx prettier` here: there is no config and it rewrites whole files.
- [x] Compress before upload (Free plan 50 MB cap): local Expo module `modules/clip-transcoder` (AVAssetReader/Writer on iOS, Media3 Transformer on Android) applies the trim, H.264, 1080 px long edge, source fps kept (240 → 120), no audio, 8/10/12 Mbps by fps, re-encode or "Too long to send" over 45 MB. Sim: 58.4 MB ref → 12.4 MB, 364/364 frames at 29.97 fps, hosted lift `done`. Android not compiled yet (no SDK on laptop or Mini).
- [ ] (Claude) Send the chosen rep to the backend: `create_lift` only takes movement + load; the trim is baked into the uploaded clip.
- [ ] (Claude) Simulator encoder overshoots the bitrate on synthetic high-motion clips (12 Mbps target → 17.7 Mbps); check on a real phone and add `AVVideoDataRateLimitsKey` if real clips overshoot too.

## Scale vs encoding (catchline-scale, 11 Oct)
- [x] Root cause for FF600EFA (orig 3.53 px/cm + jump_forward vs re-encode 2.96 + no cue): the plate ellipse was stable (210x220 px on every encoding); the side-on depth ratio (wrist rise / plate rise) was a slope anchored at the lift-off sample (far wrist guessed behind the plate) over a plate track quantised to 0.05-diameter (~11 px) grid steps, so it read 0.75-0.89 by encoding; jump forward compared two single frames while the catch frame moved +-2 frames with the feet still travelling; analysis windows began one frame late on iPhone 600-timescale files. Fixed in f92b0c6, 197e8a5, 23c5f0a: FF600EFA orig / under50 / 1080x1920 ffmpeg / avconvert now 3.39-3.51 px/cm, jump_forward on all four.
- [ ] (Claude) Not fixed: on the app's real format (608x1080, HLG tone-mapped to Rec.709) the eval set still drifts (same cue 18/27, pxPerCm within 5% 15/30). Causes: `plate_mask` uses a fixed `V < 75` and tone mapping darkens frames ~20%, so plates sit either side of the cut (21B27BAF plate 241 vs 402 px); and the scale method flips between parallax and near-plate-only when the track survives or not (20-40% jumps). An exposure-relative cut (0.5 x median V) helped some clips and broke others (tried, reverted). Needs a colour-invariant plate detector, and the eval should run on app-format clips. FF600EFA on app format: scale stable (+0.5%) but bar_forward_off_hips 8.9 -> 12.3 cm, so its cue changes.
- Note: Theil-Sen on the depth ratio reads ~16% lower than least squares (0.72 vs 0.86 on FF600EFA), the same size as the known "scale ~15% high on floor cameras". Worth checking against a measured clip.
- Note: the app uploads 1080 px on the LONG edge (608x1080 portrait), below the CV's 1280 px inference height, and tone-mapped to Rec.709. Test re-encodes must match that (avconvert Preset1920x1080 then ffmpeg scale; ffmpeg on the Mini has no zscale/tonemap).
