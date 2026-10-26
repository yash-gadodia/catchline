# Full on-device analysis (no Modal, no Mac Mini)

Written 18 Oct 2026, the night 3.0 went live. Goal: every lift is analysed on the iPhone, the video never leaves it, and the
Modal app plus the Mini worker are switched off. Supabase stays (accounts, lifts, cues, purchases, caps). Ships as **3.1**.

## What the server does today, and where each piece goes

| # | Server stage (today) | Code | On the phone | State |
|---|---|---|---|---|
| 1 | Decode, rotate, scale frames | `cv/video.py` (ffmpeg) | AVFoundation, already in `modules/pose-coreml` | done for pose |
| 2 | People + pose every frame (YOLOX-m + RTMPose-m) | `cv/pose.py` | Core ML, `modules/pose-coreml` (parity < 1 px) | done, models bundled (150 MB) |
| 3 | Kipping HSPU second pass (frame rotated 180°) | `pose.py` `unrotate`, `merge_passes` | Run pose on the rotated frame too | not started |
| 4 | Pick the lifter, track them | `cv/lifter.py` | TS port | in paused `feat/device-measure` |
| 5 | Camera motion (KLT on the background) | `track.py` `camera_path`, `stabilise` | Swift: Vision image registration or OpenCV | not started, numbers will move |
| 6 | Find + track plates (colour mask, ellipse search) | `track.py` `find_plates`, `refine_plate`, `track_plate` | Phase A: `Stages/Plates.swift`, cv2/numpy reproduced step for step. Phase B: plate detector model | phase A done (bit-exact with Python on 18 clips) / paused `feat/plate-detector` |
| 7 | Movement check + detection | `cv/movement.py`, `cv/detect.py` | TS port | in paused `feat/device-measure` |
| 8 | Reps, phases, measurements, outcomes | `phases.py`, `pipeline.py`, `lifts.py`, `gym.py` | TS port | ~3.5k lines written, parity tests missing |
| 9 | Rules + cue + confidence | `rules.py` (+ `rules.json`) | `src/analysis/device/rules.ts` | **done, PR #53** |
| 10 | Keyframe stills with bystanders blurred | `pipeline.py` `export_keyframes` | Swift: grab frame, Core Image blur of non-lifter boxes | not started |
| 11 | Save analysis, count the cue session, refund on failure | `worker/jobs.py`, `complete_lift_job`, `fail_lift_job` | New RPC `save_device_analysis` / `fail_device_lift` | not started |
| 12 | Trace for re-analysis | `cv/trace.py`, `lift-traces` bucket | Phone uploads the same small trace JSON (no video) | not started |
| 13 | Re-analyse old lifts with improved code | `worker/rerun.py` | Re-run stored traces on the phone after an app update | not started (or drop, decision 5) |
| 14 | Push "your lift is ready" | `worker/push.py` | Not needed: the phone knows | drop |
| 15 | Delete raw clip, 24 h purge | `delete_clip`, `purge_storage` | Nothing to delete: no upload | drop |

## Phases (focused build days; elapsed time depends on decisions and App Review)

**0. Measure and decide (0.5 day + Yash on device).** Run `catchline://dev-pose?uri=...` on a real iPhone, and on the oldest
iPhone we want to support. Today pose is 88% of server time (YOLOX 39 s + RTMPose 28 s of 77 s for a 12 s clip on the Mini;
M4 Mac does 6-9 fps). That number sets the minimum device and whether we need the speed-ups in phase 3. Answer decisions 1-7.

**1. Foundations (3-4 days).**
- Model download on first use: finish paused `feat/pose-model-download` (b739f81, `PoseModelStore.swift`, SHA-256 pinned, GitHub release asset). Branch `release/3.1` only.
- One native entry point `analyseOnDevice(uri, movement)` in `modules/pose-coreml` that returns pose + people + plate fits + camera path + frame stats, as the trace format `cv/trace.py` already records. That format is the contract between Swift and TS.

**2. Pixel stages in Swift (6-9 days).**
- Camera motion: Apple Vision `VNHomographicImageRegistrationRequest` on small frames with people masked, or OpenCV's KLT (exact parity, +~10 MB). Pick by parity on 10 clips.
- Plates, phase A: port `find_plates` / `refine_plate` / `track_plate` to Swift with the same thresholds, so the phone gives the server's numbers on day one (the HDR weakness stays; `TASKS.md` line ~96).
- HSPU second pass: rotate 180°, run pose, `unrotate` + `merge_passes` (port).
- Keyframe stills: decode the 7 key frames, blur every non-lifter person box (people come free from YOLOX), JPEG, upload to `keyframes` as today.

**3. Pure logic in TS (5-7 days).**
- Finish paused `feat/device-measure` (a7e0cd0): parity jest tests over traces (Python dumps intermediates, TS must match: exact for frames and chosen cue, 1e-6 relative for floats). Keep other athletes' data out of git (the 21B27BAF fixtures need checking first).
- Speed-ups if phase 0 says the phone is slow: people detection every Nth frame with the lifter tracked between (people are only needed for lifter choice, camera masking and still blur).

**4. App flow (4-5 days).**
- Analyse screen runs on the phone: progress by stage, cancel, failure screens reuse today's codes (`no_person`, `no_reps`, ...).
- iOS suspends a backgrounded app: keep the screen awake while analysing, and resume or restart the job when the app returns.
- Feature flag `EXPO_PUBLIC_ON_DEVICE_ANALYSIS` with the server path kept as fallback until phase 8.

**5. Backend (2-3 days, migration numbered from origin/catchline, pgTAP first).**
- `create_lift` unchanged: caps and consent stay server-side and are charged before analysis.
- New `save_device_analysis(lift_id, analysis, trace_path)`: owner only, lift must be `analysing`, writes `analyses`, the cue and the session count exactly as `complete_lift_job` does (share one SQL function so they can't drift). New `fail_device_lift(lift_id, code)`: refunds exactly once, like `fail_lift_job`.
- Consent copy and privacy page: "your video is analysed on your iPhone and never uploaded".

**6. Re-analysis on the phone (2 days, or drop).** On launch after an update with a newer `analysisVersion`, replay the user's traces through the TS pipeline and save with a `save_reanalysis`-style RPC.

**7. Verification (3-4 days).**
- macOS harness: the Swift stages as a CLI + the TS pipeline in node, run over the 114-clip public eval set and Yash's Lifts album; compare against Python per clip (cue, phases, cm values). Python `cv/` stays in the repo as the reference and CI oracle, never as a prod server.
- Real devices: Yash's iPhone plus one older model. Time, battery, heat, memory on a 60 s clip.

**8. Ship 3.1 (1-2 days + review).** Build, App Privacy labels (video no longer collected), review notes ("analysed on device, no third-party AI"), phased release.

**9. Switch off the servers (1 day, 2-4 weeks after 3.1).**
- 3.0 binaries still upload to the server, so first OTA to runtime 3.0 an "Update to keep analysing" screen once 3.1 is live; keep Modal on until 3.0 uploads drop near zero (watch `lifts.pose_source` and app version).
- Then: stop the Modal app, retire the Mini LaunchAgent, drop the worker wake (vault `catchline_worker_url`, pg_cron), change `ops_health` so a silent worker is no longer an alert, stop `raw-clips` uploads and its purge, archive `worker/`.

**Later (not needed to switch off): plate detector, phase B (1.5-3 weeks, needs Yash labelling).** Resume paused `feat/plate-detector` (966fb32): labelling page, ~1k confirmed boxes, YOLOX-nano or Create ML (never Ultralytics: AGPL), Core ML, swap it in for the colour finder behind a flag, re-run the eval.

**Total: about 4-6 weeks** of build to switch the servers off with today's accuracy (phases 0-9), plus 1.5-3 weeks for the plate detector.

## Decisions for Yash (before phase 1)

1. **Minimum iPhone**, from the phase 0 timing (e.g. iPhone 12 and newer).
2. **Plates:** port today's finder first so the phone matches the server (recommended), or wait for the detector.
3. **Trust:** the phone writes its own analysis. Caps stay server-side at `create_lift`, so a jailbroken phone can fake a result but not get free lifts. Recommended: accept.
4. **Android:** iOS only (Core ML). Android has never shipped; it would need TFLite later.
5. **Re-analysis of old lifts:** keep (phase 6) or drop for 3.1.
6. **3.0 sunset:** when the "please update" screen goes out, and how long Modal stays on as the safety net.
7. **Speed target:** maximum acceptable wait for a 12 s clip (e.g. 60 s).

## Risks

- **Phone speed and heat:** pose on 5-9 gym people per frame is the cost. Mitigation: phase 3 speed-ups, minimum device.
- **Numbers move:** Core ML and the camera-motion swap won't match the server bit for bit. Golden clips get re-recorded once, and phase 7 has to show the cues still agree.
- **App backgrounding** mid-analysis (phase 4).
- **App Review** of the 3.1 binary. Native work stays on `release/3.1`, never `catchline`, until 3.1 ships (OTA safety).

## Already done or paused (local commits, not pushed)

- PR #53 merged (`0c899e8`): rules + cues TS port, shared `rules.json`, "Other ways to say it".
- `feat/device-measure` a7e0cd0, `feat/pose-model-download` b739f81, `feat/plate-detector` 966fb32 in `.claude/worktrees/agent-*` (see the handoff memory).
- Separate and first tomorrow: the "no cue when filmed at an angle" fix (`fix/angle-cue`), which helps every user today regardless of this plan.

## Track eval (27 Oct 2026, `scripts/eval31/tracks.ts`, branch `v31/tracks311`)

Owner decision 27-10: the product is the tracking shown on every lift; a cue is secondary. A lift that fails a gate after
"person found" (no_reps, no_plate, no_body_scale, not_side_on; the hanging gym no_reps / shoulders_cut_off /
no_body_scale) now gives one path-only rep over the whole clip instead of the failure screen. The eval replays the 13 eval
clips (cached pose, the harness for the pixel stages it still owes: the whole-clip window and the setup + peak stills) and
the prod traces in `cv/tests/fixtures/traces` plus `~/catchline-traces`, and the `forced` rows run a snatch as a jerk so
the path-only result is exercised on real pose data (no eval clip fails a barbell gate on its own).

Run on the Mini: `npx tsx scripts/eval31/tracks.ts --clips ~/catchline-tracks311/clips.json --cache ~/catchline-tracks311/cache
--harness <abs harness> --models ~/catchline-speed31/models --traces cv/tests/fixtures/traces --traces
~/catchline-traces/cv/tests/fixtures/traces --labels ~/catchline-dataset/labels --out ~/catchline-tracks311/out
--also 2026-10-05_21B27BAF:jerk --also 2026-10-05_E0DF8887:jerk --also IMG_0073:jerk` (`--models` must be an absolute
directory of `.mlmodelc`).

Columns: **bar vs plate label** is the bar path against the dataset's per-frame plate-centre labels (`~/catchline-dataset/labels`,
clip px; median and p90 distance, median in plate radii, the signed median dx/dy with +x to the right and +y down),
only two of the 13 clips carry labels. **plate seen** is how many of the frames the plate finder searched returned a plate
(and how many fits held an outline); the bar path itself is wrist-derived on every frame (design 2.1), so the
"plate-tagged" share of the path is 0 by construction. **feet / hips** are continuity only: frames of the rep span with
no track point (the pose had no such joint, so none was invented) and single-frame jumps over 0.35 torso lengths.

| clip | set | run as | result | path | reps | bar vs plate label | plate seen | feet | hips |
|---|---|---|---|---|---|---|---|---|---|
| 2026-08-21_EDF10BB7 | bot | bar_muscle_up | path_only:no_reps | yes | 1 | no labels | 0/0 (0 fit) | 17 gap / 33 jump of 372 | 17 gap / 0 jump of 372 |
| 2026-09-18_BD1AE773 | bot | bar_muscle_up | path_only:shoulders_cut_off | yes | 1 | no labels | 0/0 (0 fit) | 1 gap / 0 jump of 311 | 1 gap / 0 jump of 311 |
| 2026-09-22_A1F2F738 | bot | kipping_pull_up | cue:leg_kip | yes | 2 | no labels | 0/0 (0 fit) | 1 gap / 0 jump of 134 | 1 gap / 0 jump of 134 |
| 2026-10-05_21B27BAF | bot | snatch | unclear_miss | yes | 1 | no labels | 9/9 (9 fit) | 0 gap / 0 jump of 116 | 0 gap / 0 jump of 116 |
| 2026-10-05_E0DF8887 | bot | snatch | clean | yes | 1 | no labels | 9/9 (9 fit) | 0 gap / 0 jump of 89 | 0 gap / 0 jump of 89 |
| IMG_0073 | owner | snatch | cue:bar_forward_off_hips | yes | 2 | no labels | 16/16 (29 fit) | 0 gap / 0 jump of 364 | 0 gap / 0 jump of 364 |
| catchline-side-snatch | proto | snatch | off_side_on | yes | 1 | no labels | 8/8 (13 fit) | 0 gap / 0 jump of 188 | 0 gap / 0 jump of 188 |
| yt_fbbuTrspjhE | proto | snatch | cue:hips_too_low_at_start | yes | 1 | 50.3 px med (dx 13.3, dy -15.2), 146.7 px p90, 0.86 r (181 fr) | 8/8 (0 fit) | 0 gap / 0 jump of 215 | 0 gap / 0 jump of 215 |
| yt_nuj--RnZy9s | proto | snatch | clean | yes | 1 | no labels | 8/8 (0 fit) | 0 gap / 0 jump of 174 | 0 gap / 0 jump of 174 |
| yt_jbhvMQamGlc | proto | clean | cue:bar_forward_off_hips | yes | 3 | no labels | 24/24 (12 fit) | 4 gap / 11 jump of 137 | 4 gap / 0 jump of 137 |
| yt_6VWB9RY9XPg | proto | snatch | cue:missed_behind | yes | 1 | 77.3 px med (dx 22.6, dy 32.3), 189 px p90, 1.36 r (147 fr) | 3/3 (0 fit) | 11 gap / 0 jump of 195 | 11 gap / 0 jump of 195 |
| yt_MNWUT1fgRZY | proto | snatch | bar_lost | yes | 2 | no labels | 16/16 (3 fit) | 0 gap / 0 jump of 119 | 0 gap / 0 jump of 119 |
| yt_wtPzZ0_hN8I | proto | clean | cue:press_out | yes | 1 | no labels | 3/8 (0 fit) | 0 gap / 0 jump of 66 | 0 gap / 0 jump of 66 |
| 2026-10-05_21B27BAF as jerk | forced | jerk | path_only:no_reps | yes | 1 | no labels | 0/0 (0 fit) | 0 gap / 0 jump of 153 | 0 gap / 0 jump of 153 |
| 2026-10-05_E0DF8887 as jerk | forced | jerk | path_only:no_reps | yes | 1 | no labels | 0/0 (0 fit) | 0 gap / 0 jump of 190 | 0 gap / 0 jump of 190 |
| IMG_0073 as jerk | forced | jerk | path_only:no_reps | yes | 1 | no labels | 0/0 (0 fit) | 0 gap / 0 jump of 1122 | 0 gap / 0 jump of 1122 |
| 2026-09-22_A1F2F738.mov | trace | kipping_pull_up | cue:leg_kip | yes | 2 | no labels | 0/0 (0 fit) | 0 gap / 0 jump of 134 | 0 gap / 0 jump of 134 |
| 2026-09-22_A1F2F738.mp4 | trace | kipping_pull_up | cue:leg_kip | yes | 2 | no labels | 0/0 (0 fit) | 7 gap / 0 jump of 128 | 7 gap / 0 jump of 128 |
| 2026-10-05_21B27BAF.mov | trace | snatch | unclear_miss | yes | 1 | no labels | 8/8 (8 fit) | 0 gap / 0 jump of 117 | 0 gap / 0 jump of 117 |
| 2026-10-05_21B27BAF.mp4 | trace | snatch | unclear_miss | yes | 1 | no labels | 8/8 (6 fit) | 0 gap / 0 jump of 115 | 0 gap / 0 jump of 115 |
| 2026-08-21_EDF10BB7.mov | trace | bar_muscle_up | path_only:no_reps | yes | 1 | no labels | 0/0 (0 fit) | 16 gap / 26 jump of 373 | 16 gap / 0 jump of 373 |
| 2026-08-21_EDF10BB7.mp4 | trace | bar_muscle_up | path_only:no_reps | yes | 1 | no labels | 0/0 (0 fit) | 2 gap / 7 jump of 387 | 2 gap / 0 jump of 387 |
| 2026-09-18_BD1AE773.mov | trace | bar_muscle_up | path_only:shoulders_cut_off | yes | 1 | no labels | 0/0 (0 fit) | 1 gap / 0 jump of 311 | 1 gap / 0 jump of 311 |
| 2026-09-18_BD1AE773.mp4 | trace | bar_muscle_up | path_only:shoulders_cut_off | yes | 1 | no labels | 0/0 (0 fit) | 1 gap / 0 jump of 311 | 1 gap / 0 jump of 311 |
| 2026-10-05_E0DF8887.mov | trace | snatch | clean | yes | 1 | no labels | 8/8 (8 fit) | 0 gap / 0 jump of 86 | 0 gap / 0 jump of 86 |
| 2026-10-05_E0DF8887.mp4 | trace | snatch | clean | yes | 1 | no labels | 8/8 (8 fit) | 0 gap / 0 jump of 89 | 0 gap / 0 jump of 89 |

Pass (every clip with a person produces a path): **yes** (26/26)

What has no ground truth: the feet, hip, shoulder, knee and elbow tracks (no dataset labels them; continuity is all that
can be measured), and the bar path on 11 of the 13 clips. On the two labelled clips the bar sits 50 and 77 px (0.86 and
1.36 plate radii) from the plate centre at the median, mostly a constant offset (dx 13 / 23 px, dy -15 / 32 px): the hands'
midpoint against a plate that sits nearer the camera, and the labels' own tool (detect + KLT) was never checked against the
bar. Both clips are 640 x 480. The yt_jbhvMQamGlc feet jumps (11 of 137) and the EDF10BB7 feet jumps (26 to 33 of ~380)
are the ankles flickering on a low-resolution lifter and a hanging athlete whose feet leave the frame; the hips never jump.

## Plate-driven bar path, any camera angle (29 Oct 2026, `v31/path311`, 3.1.1)

Owner decision 29-10: the bar path on every barbell lift comes from the near plate wherever the plate is seen; the hands only bridge the frames where it is lost, shifted so the two join without a step, and every path point says which it is (`src: 'plate' | 'wrist'`, optional, older analyses have none). Continues #181 (native `follow_plate`, `onPlate`, `fusePath`): the gate was rebuilt from an independent plate truth, the follow is anchored on the plate the setup finder fitted when that sits beyond the native start search, the jerk and the path-only rep draw from the plate too, the plate path is trusted to 45 deg off side-on, and a plate held on under a tenth of the window does not re-base the path. Cues and values stay on the hands' bar.

### Ground truth (A.3)

`~/catchline-path311/tools/truth.py`, independent of the pipeline's finder: on full-resolution frames, a fixed-radius Hough and ring vote near a second-order prediction from the previous frames, then a 96-ray radial edge fit (adaptive threshold, 0.12 of the 90th percentile of the rays' strongest gradients, which motion blur at 4K needs) and a robust `cv2.fitEllipse` with two MAD trims, iterated twice; the radius is held to 0.8-1.2 of a running median; a fit is accepted at confidence 0.3 (inlier rays of 96) next to the prediction and 0.45 for a jump or a re-acquisition; the track never stops on a loss. Seeds come from the pipeline's start plate, overridden by hand from a gridded seed sheet where that was wrong (the side snatch, IMG_0073, jbhv, MNWUT, wtPz, Ilb, 6VWB); the kettlebell clip (FZhMcOsEJVA, labelled hang_clean) has no plate. Afterwards frames further than 0.35 radii from the median of their neighbours within 4 frames and lone runs under 5 frames are dropped. Every clip's QA sheet (`out/qa/<clip>.png`, 12 crops with the fitted ellipse) was eyeballed. Its own error: edge rms 1-6 px and frame-to-frame jitter 0.3-5 px (IMG_0073 at 4K the worst), about 0.02-0.05 plate radii; it loses the plate in the fastest second-pull frames of the 4K clips (a window is covered 30-70%) and when the plate leaves the frame. Labelled: 13 barbell clips (four 4K or 1080p, three 720p, six 480p and under).

### Path vs truth (before = release/3.1 f2a0bb6, the hands' path)

| clip | rep | frames | truth fr | new med / p90 (px) | new med / p90 (r) | old med / p90 (px) | old med / p90 (r) | plate share | plate-only med (r) | max jump new / old (px) |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-05_21B27BAF | 1 | [30, 145] | 72 | 16.5 / 110.5 | 0.039 / 0.233 | 369.0 / 428.0 | 0.892 / 1.074 | 29% | 0.021 (30) | 157.8 / 146.1 |
| 2026-10-05_E0DF8887 | 1 | [42, 130] | 68 | 13.5 / 23.4 | 0.033 / 0.059 | 384.2 / 411.1 | 0.996 / 1.068 | 65% | 0.026 (41) | 163.2 / 164.9 |
| IMG_0073 | 1 | [0, 188] | 98 | 23.9 / 145.0 | 0.062 / 0.37 | 845.9 / 890.2 | 2.087 / 2.283 | 29% | 0.015 (35) | 158.5 / 89.9 |
| IMG_0073 | 2 | [821, 995] | 69 | 710.3 / 1170.4 | 1.908 / 2.683 | 710.3 / 1170.4 | 1.908 / 2.683 | 0% | nan (0) | 90.2 / 90.2 |
| catchline-side-snatch | 1 | [1, 188] | 70 | 96.9 / 104.1 | 0.477 / 0.519 | 427.2 / 450.1 | 2.103 / 2.241 | 14% | 0.035 (6) | 96.8 / 47.3 |
| yt_fbbuTrspjhE | 1 | [188, 402] | 109 | 6.2 / 59.9 | 0.109 / 0.995 | 60.2 / 158.1 | 1.084 / 2.616 | 22% | 0.038 (33) | 42.6 / 47.3 |
| yt_nuj--RnZy9s | 1 | [277, 450] | 128 | 2.0 / 9.4 | 0.042 / 0.205 | 25.6 / 41.5 | 0.542 / 0.886 | 68% | 0.034 (96) | 20.2 / 17.9 |
| yt_jbhvMQamGlc | 1 | [351, 393] | 21 | 79.3 / 88.0 | 1.234 / 1.349 | 79.3 / 88.0 | 1.234 / 1.349 | 0% | nan (0) | 32.4 / 32.4 |
| yt_jbhvMQamGlc | 2 | [564, 611] | 22 | 77.4 / 86.0 | 1.152 / 1.329 | 77.4 / 86.0 | 1.152 / 1.329 | 0% | nan (0) | 39.6 / 39.6 |
| yt_jbhvMQamGlc | 3 | [801, 850] | 15 | 91.6 / 102.9 | 1.403 / 1.636 | 91.6 / 102.9 | 1.403 / 1.636 | 0% | nan (0) | 32.4 / 32.4 |
| yt_6VWB9RY9XPg | 1 | [332, 537] | 67 | 103.0 / 130.2 | 1.988 / 2.518 | 103.0 / 130.2 | 1.988 / 2.518 | 0% | nan (0) | 50.1 / 50.1 |
| yt_MNWUT1fgRZY | 1 | [795, 854] | 0 | nan / nan | nan / nan | nan / nan | nan / nan | 0% | nan (0) | 57.6 / 57.6 |
| yt_MNWUT1fgRZY | 2 | [1328, 1386] | 28 | 75.6 / 78.5 | 1.011 / 1.052 | 75.6 / 78.5 | 1.011 / 1.052 | 0% | nan (0) | 53.4 / 53.4 |
| yt_wtPzZ0_hN8I | 1 | [752, 817] | 15 | 62.6 / 65.0 | 0.896 / 0.927 | 62.6 / 65.0 | 0.896 / 0.927 | 0% | nan (0) | 54.6 / 54.6 |
| yt_Ilb75p8X_cs | 1 | [0, 863] | 323 | 482.4 / 690.2 | 3.74 / 5.144 | 482.4 / 690.2 | 3.74 / 5.144 | 0% | nan (0) | 63.4 / 63.4 |
| yt_-CaVtYG2s-k | 1 | [207, 237] | 17 | 2.8 / 6.0 | 0.033 / 0.069 | 26.4 / 48.2 | 0.313 / 0.55 | 90% | 0.029 (14) | 23.1 / 28.3 |

Pass condition (plate-sourced median under 0.25 radii on every labelled clip, no clip worse than the hands at the p90): **met** on every clip that draws from the plate (21B27BAF, E0DF8887, IMG_0073 rep 1, the side snatch, fbbu, nuj, the 720p jerk -CaVtYG2s-k: plate-sourced medians 0.015-0.038 radii, p90 2.5-6x better than the hands), and vacuous where nothing is drawn from the plate and the path is the hands' as before (IMG_0073 rep 2, jbhv, 6VWB, MNWUT, wtPz, Ilb). Over all plate-drawn frames with truth: 96% within 0.25 radii, 1% beyond 0.5. The largest single-frame jump is the drop after the catch on every clip that has one, the same on old and new. Against the dataset's own (unchecked) labels: fbbu 0.59 radii (was 0.86), the front-on yt_xOz3maqNte8 0.06 radii over 267 frames.

### What still limits the plate path

- **The follower loses the plate in the fast pull** (fbbu 264-274, E0DF 85-100): detection score under 0.55 under motion blur and no optical-flow corners inside a black disc. Those frames are bridged by the hands, which during a turnover sit 2-3 radii from the plate (fbbu p90 1.0 radii). The phone would need a lower detection threshold when the prediction is confident, or flow on the rim rather than inside the disc.
- **Off side-on the start search seeds the far plate** (the native grid is 0.3 setup heights around its anchor and prefers rim score): fixed for IMG_0073 rep 1 and the side snatch by anchoring the request within the grid of the plate the setup finder fitted, under its own seed frame (a follow is recorded by `s0:n:seed`, so a re-anchored request with the same key gets the earlier result back, on the replay and on the phone's next pass); IMG_0073 rep 2 still seeds the far plate and the start-on-fitted-plate check rejects it, so it keeps the hands' path.
- **Dark 480p clips seed a disc smaller than the plate** (6VWB, MNWUT: the start plate is 27% under the plate's size, so the follow rides inside the rim about 0.45 radii off centre and no per-frame evidence sees it). The share rule leaves these on the hands' path. The phone would need the start plate's size checked against `refine_plate`'s outline before following.
- **Where no plate outline was fitted and the follow is wrong** (wtPz, Ilb): the gate rejects it (size, leash, co-motion), the path is the hands'.
- Beyond 45 deg off side-on no plate path is drawn (no truth exists there; see the angle table).

### Cue and key-number changes (A.2)

No cue, measurement value or key number changed on any of the 16 clips (`parity.test.ts` and the eval): cues and values stay on the hands' bar by design (the plate's own pixel scale is not the lift's, so moving drift to the plate needs the plate-depth scale, an owner call). The guides (start line, ring, peak line) moved with the path, and past 45 deg off side-on the front-view readings are added:

- 2026-08-21_EDF10BB7 [path_only:no_reps]: no change
- 2026-09-18_BD1AE773 [path_only:shoulders_cut_off]: no change
- 2026-09-22_A1F2F738 [cue:leg_kip]: no change
- 2026-10-05_21B27BAF [unclear_miss]: rep 1 ring frame 86 -> 87; rep 1 startX 0.5253 -> 0.5311; rep 1 peakY 0.1644 -> 0.175; rep 1 path plate-sourced 29% of 116; front-view readings added
- 2026-10-05_E0DF8887 [clean]: rep 1 ring frame 95 -> 97; rep 1 startX 0.5395 -> 0.5382; rep 1 peakY 0.2374 -> 0.2275; rep 1 path plate-sourced 65% of 89; front-view readings added
- IMG_0073 [cue:bar_forward_off_hips]: rep 1 ring frame 66 -> 65; rep 1 startX 0.4842 -> 0.1858; rep 1 peakY 0.1388 -> 0; rep 1 path plate-sourced 29% of 189; front-view readings added
- catchline-side-snatch [off_side_on]: rep 1 ring frame 54 -> 70; rep 1 startX 0.4841 -> 0.1878; rep 1 peakY 0.1406 -> 0.0004; rep 1 path plate-sourced 14% of 188; front-view readings added
- yt_fbbuTrspjhE [cue:hips_too_low_at_start]: rep 1 ring frame 247 -> 248; rep 1 startX 0.4671 -> 0.4307; rep 1 peakY 0.1173 -> 0.0558; rep 1 path plate-sourced 22% of 215; front-view readings added
- yt_nuj--RnZy9s [clean]: rep 1 ring frame 320 -> 313; rep 1 startX 0.477 -> 0.4895; rep 1 peakY 0.333 -> 0.3454; rep 1 path plate-sourced 68% of 174; front-view readings added
- yt_jbhvMQamGlc [cue:bar_forward_off_hips]: no change; front-view readings added
- yt_6VWB9RY9XPg [cue:missed_behind]: no change; front-view readings added
- yt_MNWUT1fgRZY [bar_lost]: no change; front-view readings added
- yt_wtPzZ0_hN8I [cue:press_out]: no change; front-view readings added
- yt_Ilb75p8X_cs [path_only:no_reps]: no change
- yt_FZhMcOsEJVA [cue:press_out]: no change; front-view readings added
- yt_-CaVtYG2s-k [cue:press_out]: rep 1 path plate-sourced 90% of 31; front-view readings added

## Any camera angle (B, 29 Oct 2026)

### What breaks front-on and from behind (B.1)

Every clip with a person already ends as a measured path: the snatch, clean and jerk rep finders work on heights (bar over the head, bar at the shoulders), which do not need side-on geometry, so reps are found on all 31 decodable front, 45 deg and behind clips; the plate finder sees a plate on nearly every setup frame (the plates column), but its outline rarely fits front-on, so the scale comes from the body everywhere (`scale` column) and no yaw gate stops the path. What the angle does cost: past 20 deg the cue is withheld (`off_side_on`) and past 45 deg the forward/back numbers are hidden (the yaw bucket), the plate path is not drawn past 45 deg, and on six front clips the ankles are unseen for 50 frames (feet track gaps). Huilong's competition clip from behind (IMG_2883) reads 30 deg by the body and analyses to two reps with a cue; the phone's "no lift found" of 26-10 is not reproduced by this pose. Six public clips cannot be decoded by AVFoundation (`clip_unreadable`) and are left out.

Per clip (`~/catchline-path311/tools/breport.py` over `out/b-after`):

| clip | angle | run as | result | yaw | reps | path | plate-sourced | plates seen | scale | follow tracked | what limits it |
|---|---|---|---|---|---|---|---|---|---|---|---|
| IMG_2883 | behind | snatch | cue:bar_forward_off_hips | - (20-45; reps [29, 32]) | 2 | [62, 236] | [0, 0] | 9/9 | body segments | [104, 257, 146] | no plate-sourced frames (gate rejected the follow) |
| yt_OQLXSLlkwYM | front | snatch | off_side_on | 34 (20-45; reps [34, 45, 44]) | 3 | [108, 111, 110] | [0, 21, 24] | 24/24 | body segments | [122, 124, 124, 115, 113, 100] | yaw gate: cue withheld, forward/back hidden |
| yt_audLFzpOPno | front | snatch | off_side_on | 43 (20-45; reps [43, 48]) | 2 | [138, 131] | [51, 0] | 10/10 | body segments | [175, 155, 172, 153] | yaw gate: cue withheld, forward/back hidden |
| yt_2E6qEs7wpyk | front | snatch | off_side_on | 64 (past_60; reps [57, 57, 64]) | 3 | [63, 68, 99] | [0, 0, 0] | 24/24 | body segments | [77, 87, 62, 83] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_rS1GEzhreuQ | front | snatch | off_side_on | 66 (past_60; reps [39, 61, 66]) | 3 | [78, 71, 106] | [0, 0, 0] | 24/24 | body segments | [80, 79, 59, 68, 0, 77] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_xOz3maqNte8 | front | snatch | unclear_miss | - (side; reps [56, 0, 8, 4, 5]) | 5 | [91, 182, 130, 107, 98] | [0, 0, 97, 80, 79] | 25/28 | body segments | [159, 133, 182, 0, 158, 147, 180, 100] | measured |
| yt_oE04VcqNVxI | front | snatch | off_side_on | 64 (past_60; reps [67, 64, 70, 5, 9]) | 5 | [122, 187, 87, 61, 185] | [0, 0, 0, 57, 0] | 27/27 | body segments | [150, 118, 0, 132, 179, 182] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden |
| yt_ye7-NlXAOgs | front | snatch | not run | | | | | | | | |
| yt_wr9NFefZDGc | front | snatch | off_side_on | 45 (45-60; reps [45, 56, 61, 64, 60, 56, 54, 55, 51, 29]) | 10 | [93, 98, 91, 127, 122, 124, 91, 92, 124, 66] | [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] | 62/62 | body segments | [58, 81, 97, 93, 118, 41, 58, 117, 80, 64, 65, 85, 51, 63, 46, 102, 111, 67, 38] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_Wg-HI5uxA2U | front | clean | cue:forward_dip | - (past_60; reps [70, 20]) | 1 | [38] | [100] | 17/17 | -, body segments | [64, 427] | forward/back numbers hidden |
| yt_aW2ux-hukc0 | front | clean | not run | | | | | | | | |
| yt_hH_F7QOJ71Y | front | clean | off_side_on | 70 (past_60; reps [70, 43]) | 1 | [193] | [0] | 10/11 | -, body segments | [163, 158, 165] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_SzlEaRuaGUM | front | clean | off_side_on | 38 (20-45; reps [38]) | 1 | [433] | [89] | 9/9 | body segments | [408, 406] | yaw gate: cue withheld, forward/back hidden |
| yt_aMl63bC88lc | front | clean | cue:early_arm_bend | - (past_60; reps [67, 53]) | 2 | [71, 65] | [0, 0] | 14/18 | body segments | [58, 70, 58, 13] | forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_V_QZvpZQioU | front | jerk | not run | | | | | | | | |
| yt_hvx69hS4Bts | front | jerk | off_side_on | 53 (45-60; reps [53, 50]) | 2 | [82, 76] | [0, 0] | 3/3 | - | [94, 116] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_0-ukOEd8V9M | front | jerk | off_side_on | 47 (45-60; reps [47, 47]) | 2 | [69, 67] | [0, 0] | 2/2 | - | [108, 105] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_j2XzQZHQL-A | front | jerk | not run | | | | | | | | |
| yt_HM1s3OBpM9s | front | jerk | off_side_on | 52 (45-60; reps [52, 52, 9, 9]) | 4 | [62, 67, 39, 65] | [0, 0, 77, 0] | 3/3 | - | [117, 88, 0, 114] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden |
| yt_JZJck0Jlus0 | 45 | snatch | cue:hips_too_low_at_start | - (45-60; reps [50]) | 1 | [113] | [0] | 8/8 | body segments | [74, 55] | forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_6YfFBffIVW8 | 45 | snatch | off_side_on | 59 (45-60; reps [59, 48, 54]) | 3 | [49, 67, 108] | [0, 0, 0] | 20/20 | body segments | [76, 78, 35, 49, 33] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_Qwk3wDVFA4A | 45 | snatch | off_side_on | 61 (past_60; reps [61, 63]) | 2 | [60, 82] | [0, 0] | 9/9 | body segments | [92, 81] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_RZ4Kb0TzRAI | 45 | clean | off_side_on | 67 (past_60; reps [67, 62, 46, 46]) | 2 | [229, 240] | [0, 0] | 18/18 | -, body segments | [202, 80, 0, 114, 202, 66, 95] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_-uNX6nqGA3c | 45 | clean | off_side_on | 67 (past_60; reps [67, 70, 51]) | 3 | [70, 76, 74] | [0, 0, 0] | 21/23 | body segments | [50, 63, 100, 0] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_4i5QCavPA8I | 45 | clean | off_side_on | 70 (past_60; reps [70, 61]) | 2 | [91, 74] | [0, 0] | 14/14 | body segments | [58, 90, 62] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_mub6RmN4IMc | 45 | clean | off_side_on | 46 (45-60; reps [46, 69]) | 2 | [70, 70] | [0, 0] | 16/16 | body segments | [58, 52, 0] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_jrYw0bwJ9BM | 45 | clean | off_side_on | 65 (past_60; reps [65, 65, 61]) | 3 | [97, 75, 95] | [0, 0, 0] | 22/23 | body segments | [55, 69, 87] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_P8mOpSXVIGQ | 45 | clean | off_side_on | 68 (past_60; reps [68, 70, 48, 48]) | 2 | [99, 95] | [0, 0] | 17/18 | -, body segments | [85, 72, 49, 77] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_IbnBdg5GeaI | 45 | clean | off_side_on | 67 (past_60; reps [67, 67, 50, 47]) | 2 | [121, 129] | [0, 0] | 18/18 | -, body segments | [102, 97, 106, 79, 106] | yaw gate: cue withheld, forward/back hidden; forward/back numbers hidden; no plate-sourced frames (gate rejected the follow) |
| yt_ccc7cOzqkr0 | 45 | clean | not run | | | | | | | | |
| yt_yxqgse57m3U | 45 | clean | cue:jump_forward | - (20-45; reps [22]) | 1 | [89] | [7] | 8/8 | body segments | [72] | measured |
| yt_l9s5In9SkxQ | 45 | clean | cue:incomplete_extension | - (side; reps [0]) | 1 | [122] | [0] | 8/8 | body segments | [78, 0] | no plate-sourced frames (gate rejected the follow) |
| yt_bCsp3kersAM | 45 | jerk | cue:press_out | - (side; reps [14]) | 1 | [72] | [0] | 1/1 | - | [107] | no plate-sourced frames (gate rejected the follow) |
| yt_VhPkTahralc | 45 | jerk | cue:press_out | - (20-45; reps [28, 31]) | 2 | [43, 57] | [44, 0] | 2/2 | - | [72, 108] | measured |
| yt_3PDuA3irc2w | 45 | jerk | not run | | | | | | | | |
| yt_sj3tNPVPlXs | 45 | jerk | cue:press_out | - (20-45; reps [34, 34]) | 2 | [64, 99] | [0, 0] | 2/2 | - | [126, 172] | no plate-sourced frames (gate rejected the follow) |
| yt_5c4sZ9iAQFU | 45 | jerk | path_only:not_side_on | 68 (past_60; reps []) | 1 | [51] | [0] | 1/1 | - | [] | path_only:not_side_on; forward/back numbers hidden; no plate-sourced frames (no plate seed) |

### Path and tracks at any yaw (B.2)

The bar path and the joint tracks are produced and drawn on every clip with a person (60 of 60 rows below, the three forced jerks and the prod traces included). The plate seed uses the largest outline the setup finder fitted, either bar end (`a`/`b` plates), as the anchor of the follow; front-on the plate is an edge-on ellipse whose outline seldom holds, so the path there is the hands' (plate share 0) unless the yaw reads under 45 deg, where the plate path is drawn as side-on (yt_xOz3maqNte8 front, 48% from the plate, 0.06 radii from the dataset's labels; audLFzpOPno 26%; SzlEaRuaGUM 89%; Wg-HI5uxA2U 100%). Beyond 45 deg the plate path is withheld: no truth exists at those angles and the follow's start-on-fitted-plate check has nothing to check against. Not done: a follow seeded on the far-side plate or on both bar ends when the near plate is foreshortened (new native work; the TS anchor can only move the start search, not what it accepts).

### Front-view readings (B.3)

Past 45 deg the key numbers list, in place of the hidden forward/back ones: bar tilt at the catch (deg, pose left hand vs right, so the camera side does not matter), the bar's sideways drift and the hips' sideways shift over the feet from lift-off to the catch (cm, towards the lifter's own left, the shoulders say which way they face), and the stance width from the ankles at setup and at the catch (cm). Sideways distances are corrected by the yaw's sine as forward ones are by its cosine. Jerks read them at the dip start and the landing. Strings in en, de, fr, es, pt-BR (`analysis.key.*`); `ResultNumbers` phrases tilt and sideways values ("left hand 3° higher", "4.1 cm to your left", "level", "centred").

### Track eval with yaw (B.4, `scripts/eval31/tracks.ts`)

Columns added: the clip list's angle label, the yaw the pipeline read (the reps' own, else the result's), and the share of the path drawn from the plate. Run: the 27-10 command with `--clips ~/catchline-path311/clips-ab.json --cache ~/catchline-path311/cache` (13 eval clips, 3 public 720p side clips, 31 public front/45 clips and the behind clip).

| clip | set | angle | run as | result | yaw | path | plate % | reps | bar vs plate label | plate seen | feet | hips |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-08-21_EDF10BB7 | bot | side | bar_muscle_up | path_only:no_reps | 11 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 17 gap / 33 jump of 372 | 17 gap / 0 jump of 372 |
| 2026-09-18_BD1AE773 | bot | side | bar_muscle_up | path_only:shoulders_cut_off | 25 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 1 gap / 0 jump of 311 | 1 gap / 0 jump of 311 |
| 2026-09-22_A1F2F738 | bot | side | kipping_pull_up | cue:leg_kip | 31 | yes | 0 | 2 | no labels | 0/0 (0 fit) | 1 gap / 0 jump of 134 | 1 gap / 0 jump of 134 |
| 2026-10-05_21B27BAF | bot | side | snatch | unclear_miss | 4 | yes | 29 | 1 | no labels | 9/9 (9 fit) | 0 gap / 0 jump of 116 | 0 gap / 0 jump of 116 |
| 2026-10-05_E0DF8887 | bot | side | snatch | clean | 3 | yes | 65 | 1 | no labels | 9/9 (9 fit) | 0 gap / 0 jump of 89 | 0 gap / 0 jump of 89 |
| IMG_0073 | owner | side | snatch | cue:bar_forward_off_hips | 35 | yes | 15 | 2 | no labels | 16/16 (29 fit) | 0 gap / 0 jump of 364 | 0 gap / 0 jump of 364 |
| catchline-side-snatch | proto | side | snatch | off_side_on | 32 | yes | 14 | 1 | no labels | 8/8 (13 fit) | 0 gap / 0 jump of 188 | 0 gap / 0 jump of 188 |
| yt_fbbuTrspjhE | proto | side | snatch | cue:hips_too_low_at_start | 11 | yes | 22 | 1 | 35.9 px med (dx -9.2, dy -14.5), 81.1 px p90, 0.59 r (181 fr) | 8/8 (0 fit) | 0 gap / 0 jump of 215 | 0 gap / 0 jump of 215 |
| yt_nuj--RnZy9s | proto | side | snatch | clean | 3 | yes | 68 | 1 | no labels | 8/8 (0 fit) | 0 gap / 0 jump of 174 | 0 gap / 0 jump of 174 |
| yt_jbhvMQamGlc | proto | side | clean | cue:bar_forward_off_hips | 33 | yes | 0 | 3 | no labels | 24/24 (12 fit) | 4 gap / 11 jump of 137 | 4 gap / 0 jump of 137 |
| yt_6VWB9RY9XPg | proto | side | snatch | cue:missed_behind | 19 | yes | 0 | 1 | 77.3 px med (dx 22.6, dy 32.3), 189 px p90, 1.36 r (147 fr) | 3/3 (0 fit) | 11 gap / 0 jump of 195 | 11 gap / 0 jump of 195 |
| yt_MNWUT1fgRZY | proto | side | snatch | bar_lost | 3 | yes | 0 | 2 | no labels | 16/16 (3 fit) | 0 gap / 0 jump of 119 | 0 gap / 0 jump of 119 |
| yt_wtPzZ0_hN8I | proto | side | clean | cue:press_out | 5 | yes | 0 | 1 | no labels | 4/9 (0 fit) | 0 gap / 0 jump of 66 | 0 gap / 0 jump of 66 |
| yt_Ilb75p8X_cs | public-side | side | clean | path_only:no_reps | 29 | yes | 0 | 1 | no labels | 1/1 (0 fit) | 8 gap / 1 jump of 856 | 8 gap / 0 jump of 856 |
| yt_FZhMcOsEJVA | public-side | side | clean | cue:press_out | 3 | yes | 0 | 1 | no labels | 5/5 (4 fit) | 0 gap / 0 jump of 34 | 0 gap / 0 jump of 34 |
| yt_-CaVtYG2s-k | public-side | side | jerk | cue:press_out | 16 | yes | 90 | 1 | no labels | 0/1 (0 fit) | 0 gap / 0 jump of 31 | 0 gap / 0 jump of 31 |
| IMG_2883 | user-behind | behind | snatch | cue:bar_forward_off_hips | 30 | yes | 0 | 2 | no labels | 9/9 (5 fit) | 0 gap / 0 jump of 298 | 0 gap / 0 jump of 298 |
| yt_OQLXSLlkwYM | public-front | front | snatch | off_side_on | 44 | yes | 15 | 3 | no labels | 24/24 (5 fit) | 0 gap / 0 jump of 329 | 0 gap / 0 jump of 329 |
| yt_audLFzpOPno | public-front | front | snatch | off_side_on | 45 | yes | 26 | 2 | no labels | 10/10 (3 fit) | 0 gap / 0 jump of 269 | 0 gap / 0 jump of 269 |
| yt_2E6qEs7wpyk | public-front | front | snatch | off_side_on | 57 | yes | 0 | 3 | no labels | 24/24 (9 fit) | 50 gap / 0 jump of 180 | 50 gap / 0 jump of 180 |
| yt_rS1GEzhreuQ | public-front | front | snatch | off_side_on | 61 | yes | 0 | 3 | no labels | 24/24 (11 fit) | 50 gap / 0 jump of 205 | 50 gap / 0 jump of 205 |
| yt_xOz3maqNte8 | public-front | front | snatch | unclear_miss | 5 | yes | 48 | 5 | 4.5 px med (dx 1.3, dy -0.6), 16 px p90, 0.06 r (267 fr) | 25/28 (21 fit) | 22 gap / 0 jump of 586 | 22 gap / 0 jump of 586 |
| yt_oE04VcqNVxI | public-front | front | snatch | off_side_on | 64 | yes | 5 | 5 | no labels | 27/27 (14 fit) | 0 gap / 0 jump of 642 | 0 gap / 0 jump of 642 |
| yt_wr9NFefZDGc | public-front | front | snatch | off_side_on | 55 | yes | 0 | 10 | no labels | 62/62 (53 fit) | 0 gap / 0 jump of 1028 | 0 gap / 0 jump of 1028 |
| yt_Wg-HI5uxA2U | public-front | front | clean | cue:forward_dip | 45 | yes | 100 | 1 | no labels | 17/17 (8 fit) | 0 gap / 0 jump of 38 | 0 gap / 0 jump of 38 |
| yt_hH_F7QOJ71Y | public-front | front | clean | off_side_on | 56 | yes | 0 | 1 | no labels | 10/11 (2 fit) | 13 gap / 0 jump of 180 | 13 gap / 0 jump of 180 |
| yt_SzlEaRuaGUM | public-front | front | clean | off_side_on | 38 | yes | 89 | 1 | no labels | 9/9 (2 fit) | 0 gap / 0 jump of 433 | 0 gap / 0 jump of 433 |
| yt_aMl63bC88lc | public-front | front | clean | cue:early_arm_bend | 60 | yes | 0 | 2 | no labels | 14/18 (10 fit) | 16 gap / 0 jump of 120 | 16 gap / 0 jump of 120 |
| yt_hvx69hS4Bts | public-front | front | jerk | off_side_on | 51 | yes | 0 | 2 | no labels | 3/3 (0 fit) | 0 gap / 0 jump of 158 | 0 gap / 0 jump of 158 |
| yt_0-ukOEd8V9M | public-front | front | jerk | off_side_on | 47 | yes | 0 | 2 | no labels | 2/2 (0 fit) | 0 gap / 0 jump of 136 | 0 gap / 0 jump of 136 |
| yt_HM1s3OBpM9s | public-front | front | jerk | off_side_on | 31 | yes | 13 | 4 | no labels | 3/3 (2 fit) | 22 gap / 0 jump of 211 | 22 gap / 0 jump of 211 |
| yt_JZJck0Jlus0 | public-45 | 45 | snatch | cue:hips_too_low_at_start | 50 | yes | 0 | 1 | no labels | 8/8 (13 fit) | 0 gap / 0 jump of 113 | 0 gap / 0 jump of 113 |
| yt_6YfFBffIVW8 | public-45 | 45 | snatch | off_side_on | 54 | yes | 0 | 3 | no labels | 20/20 (7 fit) | 50 gap / 0 jump of 174 | 50 gap / 0 jump of 174 |
| yt_Qwk3wDVFA4A | public-45 | 45 | snatch | off_side_on | 62 | yes | 0 | 2 | no labels | 9/9 (0 fit) | 0 gap / 0 jump of 142 | 0 gap / 0 jump of 142 |
| yt_RZ4Kb0TzRAI | public-45 | 45 | clean | off_side_on | 54 | yes | 0 | 2 | no labels | 18/18 (4 fit) | 0 gap / 0 jump of 469 | 0 gap / 0 jump of 469 |
| yt_-uNX6nqGA3c | public-45 | 45 | clean | off_side_on | 67 | yes | 0 | 3 | no labels | 21/23 (2 fit) | 0 gap / 0 jump of 220 | 0 gap / 0 jump of 220 |
| yt_4i5QCavPA8I | public-45 | 45 | clean | off_side_on | 66 | yes | 0 | 2 | no labels | 14/14 (0 fit) | 0 gap / 0 jump of 165 | 0 gap / 0 jump of 165 |
| yt_mub6RmN4IMc | public-45 | 45 | clean | off_side_on | 58 | yes | 0 | 2 | no labels | 16/16 (2 fit) | 0 gap / 0 jump of 140 | 0 gap / 0 jump of 140 |
| yt_jrYw0bwJ9BM | public-45 | 45 | clean | off_side_on | 65 | yes | 0 | 3 | no labels | 22/23 (0 fit) | 50 gap / 0 jump of 217 | 50 gap / 0 jump of 217 |
| yt_P8mOpSXVIGQ | public-45 | 45 | clean | off_side_on | 58 | yes | 0 | 2 | no labels | 17/18 (0 fit) | 0 gap / 0 jump of 194 | 0 gap / 0 jump of 194 |
| yt_IbnBdg5GeaI | public-45 | 45 | clean | off_side_on | 58 | yes | 0 | 2 | no labels | 18/18 (1 fit) | 0 gap / 0 jump of 250 | 0 gap / 0 jump of 250 |
| yt_yxqgse57m3U | public-45 | 45 | clean | cue:jump_forward | 22 | yes | 7 | 1 | no labels | 8/8 (0 fit) | 0 gap / 0 jump of 89 | 0 gap / 0 jump of 89 |
| yt_l9s5In9SkxQ | public-45 | 45 | clean | cue:incomplete_extension | 0 | yes | 0 | 1 | no labels | 8/8 (2 fit) | 0 gap / 0 jump of 122 | 0 gap / 0 jump of 122 |
| yt_bCsp3kersAM | public-45 | 45 | jerk | cue:press_out | 14 | yes | 0 | 1 | no labels | 1/1 (0 fit) | 0 gap / 0 jump of 72 | 0 gap / 0 jump of 72 |
| yt_VhPkTahralc | public-45 | 45 | jerk | cue:press_out | 30 | yes | 19 | 2 | no labels | 2/2 (1 fit) | 0 gap / 0 jump of 100 | 0 gap / 0 jump of 100 |
| yt_sj3tNPVPlXs | public-45 | 45 | jerk | cue:press_out | 34 | yes | 0 | 2 | no labels | 2/2 (1 fit) | 0 gap / 0 jump of 163 | 0 gap / 0 jump of 163 |
| yt_5c4sZ9iAQFU | public-45 | 45 | jerk | path_only:not_side_on | 68 | yes | 0 | 1 | no labels | 1/1 (0 fit) | 6 gap / 3 jump of 51 | 6 gap / 0 jump of 51 |
| 2026-10-05_21B27BAF as jerk | forced | side | jerk | path_only:no_reps | 8 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 0 gap / 0 jump of 153 | 0 gap / 0 jump of 153 |
| 2026-10-05_E0DF8887 as jerk | forced | side | jerk | path_only:no_reps | 7 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 0 gap / 0 jump of 190 | 0 gap / 0 jump of 190 |
| IMG_0073 as jerk | forced | side | jerk | path_only:no_reps | 38 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 0 gap / 0 jump of 1122 | 0 gap / 0 jump of 1122 |
| 2026-09-22_A1F2F738.mov | trace | - | kipping_pull_up | cue:leg_kip | 31 | yes | 0 | 2 | no labels | 0/0 (0 fit) | 0 gap / 0 jump of 134 | 0 gap / 0 jump of 134 |
| 2026-09-22_A1F2F738.mp4 | trace | - | kipping_pull_up | cue:leg_kip | 30 | yes | 0 | 2 | no labels | 0/0 (0 fit) | 7 gap / 0 jump of 128 | 7 gap / 0 jump of 128 |
| 2026-10-05_21B27BAF.mov | trace | - | snatch | unclear_miss | 3 | yes | 0 | 1 | no labels | 8/8 (8 fit) | 0 gap / 0 jump of 117 | 0 gap / 0 jump of 117 |
| 2026-10-05_21B27BAF.mp4 | trace | - | snatch | unclear_miss | 3 | yes | 0 | 1 | no labels | 8/8 (6 fit) | 0 gap / 0 jump of 115 | 0 gap / 0 jump of 115 |
| 2026-08-21_EDF10BB7.mov | trace | - | bar_muscle_up | path_only:no_reps | 12 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 16 gap / 26 jump of 373 | 16 gap / 0 jump of 373 |
| 2026-08-21_EDF10BB7.mp4 | trace | - | bar_muscle_up | path_only:no_reps | 10 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 2 gap / 7 jump of 387 | 2 gap / 0 jump of 387 |
| 2026-09-18_BD1AE773.mov | trace | - | bar_muscle_up | path_only:shoulders_cut_off | 25 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 1 gap / 0 jump of 311 | 1 gap / 0 jump of 311 |
| 2026-09-18_BD1AE773.mp4 | trace | - | bar_muscle_up | path_only:shoulders_cut_off | 24 | yes | 0 | 1 | no labels | 0/0 (0 fit) | 1 gap / 0 jump of 311 | 1 gap / 0 jump of 311 |
| 2026-10-05_E0DF8887.mov | trace | - | snatch | clean | 3 | yes | 0 | 1 | no labels | 8/8 (8 fit) | 0 gap / 0 jump of 86 | 0 gap / 0 jump of 86 |
| 2026-10-05_E0DF8887.mp4 | trace | - | snatch | clean | 3 | yes | 0 | 1 | no labels | 8/8 (8 fit) | 0 gap / 0 jump of 89 | 0 gap / 0 jump of 89 |

Pass (every clip with a person produces a path): **yes** (60/60)


## Pose pass speed (3.1.1)

A lifter's 33 s untrimmed clip sat at "analysing 5%" for minutes (26-10). The pose pass is 1/3 of the bar (`analyseLoop` scales each pass into a third), so 5% is ~15% of pose. Measured with the macOS harness (`modules/pose-coreml/harness`, release build, bundled FP32 models-pose-v1, all compute units) on the idle M4 Mini, ms per frame:

| clip | frames | decode | upright | detect | pose (posed/people) | camera | total s |
|---|---|---|---|---|---|---|---|
| side-on snatch, app transcode 1080x1920 | 270 | 0 | 6 | 26 | 6 (1.2/1.3) | 3 | 11.0 |
| owner snatch 608x1080 (21B27BAF) | 153 | 0 | 4 | 26 | 13 (2.9/5.6) | 2 | 7.1 |
| owner 37 s untrimmed, 1080x1920 SDR (IMG_0073) | 1122 | 0 | 6 | 26 | 5 (1.1/1.4) | 3 | 45.2 |

The person detector (YOLOX, 24-25 ms of Core ML per frame) is ~2/3 of the pass; lifter-only pose (#130) already took pose from ~66 to 5-13 ms. Decode reads 0 because AVAssetReader decodes ahead on the media engine.
