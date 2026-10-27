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

## Pose pass speed (3.1.1)

A lifter's 33 s untrimmed clip sat at "analysing 5%" for minutes (26-10). The pose pass is 1/3 of the bar (`analyseLoop` scales each pass into a third), so 5% is ~15% of pose. Measured with the macOS harness (`modules/pose-coreml/harness`, release build, bundled FP32 models-pose-v1, all compute units) on the idle M4 Mini, ms per frame:

| clip | frames | decode | upright | detect | pose (posed/people) | camera | total s |
|---|---|---|---|---|---|---|---|
| side-on snatch, app transcode 1080x1920 | 270 | 0 | 6 | 26 | 6 (1.2/1.3) | 3 | 11.0 |
| owner snatch 608x1080 (21B27BAF) | 153 | 0 | 4 | 26 | 13 (2.9/5.6) | 2 | 7.1 |
| owner 37 s untrimmed, 1080x1920 SDR (IMG_0073) | 1122 | 0 | 6 | 26 | 5 (1.1/1.4) | 3 | 45.2 |

The person detector (YOLOX, 24-25 ms of Core ML per frame) is ~2/3 of the pass; lifter-only pose (#130) already took pose from ~66 to 5-13 ms. Decode reads 0 because AVAssetReader decodes ahead on the media engine.

Lifter tracking (the detector every 4th frame, the box carried from the previous pose, `detectInterval` in `AnalyseOnDevice.swift`) cut detect from 26 to 7 ms/frame and halved the pass, but RTMPose moves its keypoints ~2 px whenever its crop is not the detector's own box: lifter p50 1.55 px against the 1 px bar, 7-9 frames per clip picked another person, and 3 of the 13 eval clips changed cue. It stays off (1), as the FP16 detector did in #130. Pose every other frame was not tried: pose is 5-13 ms, the detector is the cost, and any faster detector moves the boxes the same way.

## Background completion (3.1.1)

Speed being capped by the 1 px bar, the run finishes without the lifter watching. On iOS 26 `analyseOnDevice` submits a `BGContinuedProcessingTask` (`ContinuedRun.swift`, identifier `<bundle id>.analyse` permitted in `app.json`) with the processing screen's words, so the passes go on after they leave, with the analysis's progress in the system's Live Activity; the JS loop ends it. Cancelling it there, or the system ending it, makes the pass reject with `interrupted` and the loop reruns it when the app is active again, the same path older iOS already took for a pass that died while the app was away. A lift that finishes while the app is not active posts one local "Your Snatch is ready" notification (only if notifications are allowed) that opens the lift from Documents. No GPU is requested in the background: that needs the Background GPU Access capability on the App ID; a Core ML segment that needs the GPU fails and the rerun covers it.
