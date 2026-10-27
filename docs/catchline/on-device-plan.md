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
