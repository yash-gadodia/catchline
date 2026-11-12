# Track only the lift

Status: design, not built (12 Nov 2026). Branch `v40/speed`.

## Why

Tracking runs the person detector and the pose model on every frame of the clip, then `liftWindow`
(`src/analysis/device/liftWindow.ts`) finds where the lift is and the player keeps to it. On a clip that is mostly
walking up, chalking and standing around, most of the pose work is on frames nobody looks at. The window needs only
the hands' and feet's height over time, which a pose read every 6th frame gives as well as every frame.

## Shape

Two native pose passes instead of one, both inside the existing first `analyseOnDevice` call:

1. **Scout pass.** Detector + pose on every 6th frame only (`stride: 6`). The prepare threads skip the colour
   conversion for the other frames (decode stays sequential: AVAssetReader has no cheap seek per frame). No carrying
   between detections (6 frames is too far for a carried box). Output: a sparse lifter (`selectLifter` on the sampled
   rows), sent to TS through a new trace field `scout: { stride, k, scores }`.
2. **Window.** TS runs `liftWindow` on the scout lifter with `fps / stride`, the low-pass cutoff clamped to 0.4 of
   that rate (6 Hz is above Nyquist at 5 samples a second), and pads the result by 0.5 s a side (the scout's own
   resolution is 0.2 s at 30 fps). A null window (squat from a rack, gymnastics, a clip already trimmed to the lift)
   means the whole clip.
3. **Full pass**, only inside the padded window: today's pass (detector every Nth frame, carried boxes, camera
   path). Frames outside it get an empty people row, so `selectLifter`, the trace and `body.json` keep one row per
   clip frame and the outside rows are null.

Inside native this is `posePass(range:)` plus `posePass(stride:)`; the JS loop is unchanged (`analyseLoop` still
calls `analyseOnDevice`, the native side runs both passes and reports one progress figure: scout 0-0.2, full
0.2-1).

## What has to change, and the risk in each

| Piece | Change | Risk |
|---|---|---|
| `ClipReader.read(ahead:)` | a `want: (Int) -> Bool` so skipped frames are decoded but not prepared | low |
| `posePass` | stride and range; outside rows empty | medium: `plate-integrate` edits the same function |
| camera path (KLT) | starts at the window's first frame; identity before it | medium: `toWorld` / `toRef` take the path as given, but `Ms` for frames outside the window must still exist |
| `selectLifter` (Lifter.swift) | must accept empty rows at the ends (it does for frames where nobody is seen today) | low |
| `trackTrace` / plan loop | plate plans are built from the lifter, so they already stay inside the window | low |
| `liftWindow` on the scout | new caller with a lower fps; thresholds are in standing heights, unchanged | medium: needs its own eval on the 17 clips (window from scout vs window from the full pass) |
| Player | `body.frames` has null rows outside the window; `TrackOverlay` draws per joint `p ? ... : null`, the path is limited to plate frames, "whole clip" plays the video with nothing drawn outside the lift | low, check on the simulator |
| Share render | `trackShare.ts` keeps to `analysis.lift` already | low |
| Native surface | `modules/` change: ships with the next store build, like detector-every-Nth | none extra |

## Cost

Per clip, with `F` the cost of a full-pass frame and `s` the scout's stride:
`n / s * F_detect+pose + w * F` against `n * F` today, `w` the padded window. A null window costs the scout on top
(`1/s` = 17% more at stride 6).

Measured on the 17 eval clips (the 11 owner phone clips in `~/catchline-v40/photos` plus 6 from `~/catchline-cv2/clips`),
window from `analysis.lift` of today's every-frame pass, padded 0.5 s a side, stride 6:

| clip | frames | window share | scout + window, of today |
|---|---|---|---|
| IMG_1558 | 456 | 0.43 | 0.60 |
| IMG_0596 | 377 | 0.48 | 0.65 |
| 2026-08-26_1193CA88 | 401 | 0.65 | 0.82 |
| IMG_1559 | 331 | 0.64 | 0.81 |
| IMG_1561 | 306 | 0.68 | 0.84 |
| IMG_0976 | 647 | 0.72 | 0.89 |
| IMG_0830, 2026-10-04_100B1719 | 246, 259 | 0.78 | 0.95 |
| IMG_1178, IMG_0975, 2026-10-05_21B27BAF | 593, 416, 153 | 0.85-0.86 | 1.01-1.03 |
| IMG_1177 | 955 | 0.92 | 1.08 |
| IMG_0591, IMG_1179, snatch-2026-09-20, 2 hanging clips | 938, 748, 1122, 221, 359 | no window | 1.17 |

Mean 0.96 of today's work: **no gain on these clips.** They are mostly lift already (several lifts or long
setups inside one window), and five have no window at all. The idea pays only on a clip that is long and mostly not
the lift (the 30 s clip with a 5 s lift: about 0.4), which none of these 17 is.

**Recommendation: do not build it now.** Detector-every-Nth (in `posePass`) cuts every frame's cost, lift or not.
Revisit if real-user clips (PostHog: clip length vs `analysis.lift` length) show long clips with short lifts; even
then a cheaper version is to skip the pose pass before the lifter trims, i.e. send the trim screen's range to native.

## Not decided

- Reuse the scout's frames inside the window as the full pass's detection frames (stride 6 = detect every 6th):
  saves the 1/6 again but ties N to the stride and to the re-detect rules.
- Whether a clip the lifter trimmed on the trim screen (most clips after `/capture/trim`) should skip the scout.
