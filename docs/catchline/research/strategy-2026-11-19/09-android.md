# Catchline on Android: scoping report

Read-only pass over `/Users/yash/dev/catchline-wt-referral`; nothing was built or run. Effort figures are my estimates, not measurements.

## 1. Native inventory

Shipping Swift is 6,109 lines, plus 616 lines of macOS harness. The only Android code in the repo is one 178-line Kotlin file.

| Piece | Files (lines) | What it does | Apple frameworks | Android today |
|---|---|---|---|---|
| `modules/pose-coreml/ios` core | `AnalyseOnDevice.swift` (737), `PoseCoreMLCore.swift` (596), `PoseCoreMLModule.swift` (142), `Lifter.swift` (124), `TraceJSON.swift` (109), `PoseModelStore.swift` (183), `ContinuedRun.swift` (77) | Decodes the clip to upright 1280 px frames, runs YOLOX and RTMPose, picks the lifter, writes a gzipped trace, continues in the background | AVFoundation, CoreVideo, CoreML, Accelerate, BackgroundTasks, AppleArchive, CryptoKit, zlib | None; config is `"platforms": ["apple"]` |
| `modules/pose-coreml/ios/Stages` | `Plates.swift` (1160), `CameraMotion.swift` (476), `StageAPI.swift` (171), `Keyframes.swift` (162), `PlateNet.swift` (142), `FindPlate.swift` (114), `InvertedPass.swift` (85), `PlateTap.swift` (84) | Step-for-step OpenCV ports (KLT camera motion, colour-mask plate finder), PlateNet crop and peaks, keyframe stills | Accelerate, CoreML, CoreVideo, Vision, ImageIO, CoreGraphics | None |
| `modules/clip-transcoder/ios` | `TrackRenderer.swift` (687), `StoryRenderer.swift` (361), `ShareRenderer.swift` (282), `ClipTranscoderModule.swift` (245) | Prepares the clip (H.264, 1080 long edge, forced Rec. 709) and burns the overlay into share videos, 9:16 stories and JPEGs | AVFoundation, CoreImage, CoreText, ImageIO, UIKit | Partial: `android/.../ClipTranscoderModule.kt` (178) has `probe` and `transcode` only, on Media3 Transformer 1.9.0 |
| `modules/lift-camera/ios` | `LiftCameraModule.swift` (172) | 1080p60 8-bit recording | AVFoundation, UIKit | None; `src/features/capture/camera/index.tsx` falls back to expo-camera at 30 fps |
| `plugins/withoutIntercomPush.js` | 10 | Intercom config tweak | n/a | n/a |

**Other iOS-only surface**
- **`app.json`:** app group entitlement, `BGTaskSchedulerPermittedIdentifiers`, `usesAppleSignIn`. The `android` block has only a package name and icon.
- **`package.json`:** `expo-apple-authentication` and `@bacons/apple-targets` (I found no use of the latter outside `package.json`).
- **`scripts/fetch-pose-models.sh`:** exits early on Android.
- **Platform checks that matter:**
  - `app/share/index.tsx:49` gates `canRenderVideo` to iOS.
  - `src/features/paywall/hooks.ts:36` skips the sign-in-before-purchase step off iOS, and there is no Google sign-in.
  - `src/features/purchases/usePurchases.ts:49` already reads an Android RevenueCat key.
- The rest are cosmetic (keyboard behaviour, action sheets).

**Two gaps in the existing Kotlin**
- It never sets an HDR mode, while the iOS side forces Rec. 709. HDR sources are therefore unhandled on Android.
- The comment in `modules/pose-coreml/index.ts` ("null on Android, where the server keeps running pose") is stale: `CLAUDE.md` says the worker was retired in migration 0023. An Android build today would throw `no_native` in `src/data/devicePipeline.ts`.

## 2. Models

| Model | Format and location | Source | Convertible? |
|---|---|---|---|
| YoloxHuman (YOLOX-m humanart) | `.mlmodelc`, FP32, gitignored; fetched from GitHub release `models-pose-v1`, SHA-pinned in `modules/pose-coreml/models.lock` | rtmlib "balanced" ONNX, Apache-2.0, via `cv/scripts/export_coreml.py` | Yes; the upstream is ONNX and is what `cv/catchline_cv/pose.py` runs on CPU |
| RTMPoseHalpe26 (RTMPose-m) | Same | Same | Yes |
| PlateNet v1 | `modules/pose-coreml/ios/plate/PlateNet.mlmodelc`, 1.9 MB, FP16, committed; 256×256 in, 4×64×64 out | PyTorch MobileNetV3-small with a CenterNet head, 0.90 M params; code on branch `v40/plate-model` under `cv/plate_model/` | Yes from PyTorch, if the checkpoint is available |

- **Precision warning:** `export_coreml.py` records that FP16 RTMPose moved keypoints 13 px at p95 and flipped a made/missed call. FP16 YOLOX moved them 9.5 px at p95 and was not shipped. Android GPU delegates default to FP16, so this bites directly.
- **Speed warning:** `docs/catchline/on-device-plan.md` says an M4 Mac runs this pose stack at 6-9 fps.

## 3. Cross-platform share

- **TypeScript:** 33,359 non-test lines in `src` and `app`, about 85% of the app's code.
- **Tracking logic is already TS:** `src/analysis` is 6,007 lines, of which `src/analysis/device` is 5,275 (`pipeline.ts` 1366, `lifts.ts` 863, `plateNet.ts` 231, `tracking.ts` 111). Bar speed is in `src/features/analysis/speed.ts`.
- **The trace is the contract:** native only reads pixels and emits the `cv/trace.py` format. Which peak is the lifter's plate, the path, and the body lines are all decided in TS and ship by OTA.

## 4. Android equivalents and effort

Engineer-days assume one engineer with an AI coding agent.

| Piece | Android equivalent | Days | Main risk |
|---|---|---|---|
| Kotlin module, plan and trace JSON, lifter pick | expo-modules Kotlin API | 3-4 | Low |
| Frame decode to upright BGR | MediaCodec with ImageReader, or Media3 | 4-6 | Vendor decoders, exact frame counts, HDR tone mapping |
| Pose inference, NMS, SimCC decode | ONNX Runtime Mobile (XNNPACK or NNAPI) or LiteRT | 5-7 | FP16 delegates, speed |
| Speed work for mid-range phones | Detect every Nth frame, smaller models | 5-10 | Changes accuracy, needs its own baseline |
| PlateNet and `findPlate` | Same runtime | 2 | The INTER_AREA crop must match training |
| Camera motion | OpenCV Android SDK (the Swift mirrors cv2 call for call) | 2-3 | About 10 MB of binary |
| Rule plates, follow, tap, stills, inverted pass | OpenCV | 5-7 | Only needed for full parity |
| Track, story and share renderers | Media3 Transformer with Canvas overlay effects | 7-10 | Encoder fragmentation, font metrics against CoreText |
| 60 fps camera | CameraX or Camera2 | 2-3 | Per-device 60 fps support |
| Background run | Foreground service | 1-2 | OEM task killers |
| Sign-in, Play billing, store listing, Android UI pass | Google sign-in, RevenueCat | 7-10 | The app has never run on Android |
| Parity harness and gate | See section 5 | 4-5 | |

## 5. Verifying parity without a device fleet

The gate (`scripts/eval31/gate.sh`, `.claude/skills/release-verify/SKILL.md`) runs 14 owner clips on the Mac Mini through the Swift harness and then `trackTrace`. It fails on:
- a lost plate path;
- plate share down more than 10 points;
- joints seen down more than 3 points;
- the hand-labelled plate score (`L`) down more than 10 points;
- a bar path on a no-barbell clip.

`--replay` re-scores saved traces in seconds. That gives three layers for Android:

1. **Desktop core harness.** Keep the Android pixel core free of Android APIs and run it on the Mini as a JVM command-line tool with onnxruntime. It emits the same trace, so the existing `gate.ts` scoring applies with a second baseline. `cv/scripts/pose_parity.py` already compares two runs' keypoints at p50/p95.
2. **Emulator or device farm.** An instrumented test pushes the gate clips, pulls the traces, and replays them on the Mini. This isolates decoder and delegate drift per chipset (one Pixel, one mid Samsung Exynos, one MediaTek).
3. **One owned mid-range phone** for speed, heat and the watch-it-work steps the skill requires.

The clips are private and live on the Mini, so farm uploads need the owner's go.

## 6. Paths

| Path | Scope | Days | Trade-off |
|---|---|---|---|
| A. Full port | Everything in section 4 | 45-65 | Full parity; pays for the 1160-line rule finder and three renderers before knowing whether pose is fast enough |
| B. Reduced v1 | Import, prepare, pose, PlateNet, OpenCV camera motion, tracker screen with path, body lines and bar speed, one share-video renderer, expo-camera at 30 fps | 22-30 | No stories, tap fallback, 60 fps capture or rule finder at launch |
| C. No port | Revive the Python `cv/` and `worker/` server for Android, or a web build | 10-15 server; 20-30 web | Server breaks the "clip stays on the phone" invariant and adds per-lift cost; web has weak video export and is slow |

**Recommendation: B**, built on the trace contract so it grows into A.
- Body lines come free with pose, which the lifter pick and PlateNet crop need anyway. Dropping them saves nothing.
- The real cuts are the rule finder, the story renderer and the custom camera.
- One thing to confirm first: in `pipeline.ts` (lines 498-507) the rule `plates()` call looks like the fallback when PlateNet is absent, but I did not trace the branch fully.

**Phases**
1. Core and harness (2 weeks).
2. Speed and a mid-range baseline (1-2 weeks).
3. Share renderer, billing and sign-in (2 weeks).
4. Play closed test.
5. Stories, 60 fps and fallbacks.

**First two-week milestone**
- `expo run:android` boots.
- A Kotlin `PoseCoreML` equivalent emits a trace for pose and PlateNet (identity camera path); `TrackerScreen` plays one tracked clip on a Pixel.
- The JVM harness runs the 14 gate clips with an Android baseline recorded.
- Seconds-per-clip measured on one mid-range phone.

Go or no-go on speed is decided then.

## Existing Android mentions

- `docs/catchline/on-device-plan.md:77`: "iOS only (Core ML). Android has never shipped; it would need TFLite later."
- `TASKS.md:171`: the Media3 transcoder.
- `TASKS.md:248`: open item, "renderShareVideo is iOS only; Android shows the still card".
- `docs/catchline/PRODUCTS.md:61-63` and `docs/catchline/STORE_REPLACEMENT.md:93`: a RevenueCat Android app and key.
- `CLAUDE.md:3` calls it "an iOS/Android app".

## Could not determine

- Whether the Android app currently builds or launches.
- Pose model sizes: `CLAUDE.md` says about 150 MB, the podspec comment says about 60 MB, and the files are not on this machine.
- Whether the PlateNet PyTorch checkpoint still exists; the branch README says weights stay on the Mini in `~/catchline-plate-model`.
- Real Android inference speed; nothing in the repo measures it.
- The competitor's Android share; no evidence in the repo.
