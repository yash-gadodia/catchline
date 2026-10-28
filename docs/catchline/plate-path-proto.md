# Plate-centre bar path: prototype (23 Oct 2026)

Goal (owner, 23-10): copy the coaching overlay from a reference reel. That means drawing the bar path from the centre of the near plate (the sleeve end, side-on) instead of the wrist midpoint, plus a vertical line through the start position, horizontal lines at knee, hip and peak bar height, and a ring on the plate at the cue moment.

Nothing here ships. The script is `cv/scripts/plate_path_proto.py`. It reads a clip, its pose cache and the pipeline's analysis JSON, and writes `tracks.json`, `compare.mp4` (1080x1920 H.264, slowed 2x, 0.6 s hold on the ring frame; left = today's wrist path, right = plate path + reference lines) and `sheet.png`. Clips and renders stay on the Mini in `~/catchline-proto/out/` and are not committed.

```
cd cv && uv run --with pillow python scripts/plate_path_proto.py CLIP ANALYSIS.json --cache DIR --out DIR
```

## What the prototype does

- **Seed.** It collects three candidates at setup: a Hough rim circle (CLAHE first), today's `find_plates`, and a physics fit (a disc 30-80% of the crouched lifter's height, standing at the feet, by the hands). It keeps the candidate whose outline best sits on a radial edge (`rim_support`). Today's "largest close fit" takes a dark floor or wall for the plate in dim gyms. That happened in 5 of the 6 eval clips; see `today_seed_ok`.
- **Before.** `track_plate` (what the Swift `trackPlateStep` ports) runs from the same seed, so the before/after numbers compare trackers, not seeds.
- **After**, per frame:
  1. A Hough circle near a constant-velocity prediction, or the mask ellipse when that scores ≥0.6.
  2. Otherwise, KLT on features inside the plate's hub.
  3. The track never stops. It re-acquires within 1.2 plate widths of `wrist + last plate-to-wrist offset`, on the same side of the hands as at setup.
  4. The plate size follows the refits, because off side-on the near plate grows and travels more than the wrists.
  5. Gaps are filled with the wrist path shifted by the plate-to-wrist offset, interpolated across the gap, so there is no seam. In practice no clip needed this.

## Results (best rep, setup to end of rep)

"Detected / KLT" is the after-track's split. **On plate** is my visual check of the sheets: a detection is not the same as the right detection.

| clip | angle | seed rim | before % | before lost at | after % | detected / KLT | on plate? | plate vs wrist mean (cm) | fwd dx (cm) | ring |
|---|---|---|---|---|---|---|---|---|---|---|
| owner `catchline-side-snatch` | ~32° off | 0.69 | 19.6 | turnover | 100 | 89.5 / 10.5 | yes, setup to overhead catch | 70.8 | -65.5 | max drift |
| `yt_fbbuTrspjhE` snatch | side | 0.50 | 26.9 | transition | 100 | 98.7 / 1.3 | yes | 36.5 | -8.8 | cue |
| `yt_nuj--RnZy9s` snatch | side | 0.72 | 98.6 | recovery | 100 | 100 / 0 | yes | 14.5 | -2.6 | max drift |
| `yt_jbhvMQamGlc` hang clean, 15 fps | side | 0.49 | 85.2 | recovery | 100 | 100 / 0 | roughly (wobbly at 15 fps) | 23.5 | -21.4 | max drift |
| `yt_6VWB9RY9XPg` power snatch | side, very dark | 0.19 | 0.6 | setup | 94.8 | 76.8 / 18.1 | partly: zigzags in the pull, right overhead | 31.5 | -4.3 | cue |
| `yt_MNWUT1fgRZY` snatch | side, motion blur | 0.68 | 100 | – | 97.3 | 75.7 / 21.6 | no: sits at the thigh once the plate blurs | 111.5 | 36.8 | max drift |
| `yt_wtPzZ0_hN8I` clean | side | 0.57 | 0.3 | setup | 99.2 | 15.8 / 83.4 | no: KLT drifts in the turnover (the mask-only version tracked this clip) | 60.8 | -42.4 | max drift |

The side-on picks came from vetting the eval set's "side" labels by eye. GennApwdEfo and Doz5wKPD6BQ are front-on; PrfAwKTDedI, Ilb75p8X_cs and P3TM2roWdHY are about 45°. jiXRRchwWy4 got 0 reps from the pipeline.

## What we learned

- Today's tracker stops for good at its first miss. The Swift port also gives up when the plate's top leaves the frame (`centre.y - axes.0/2 >= 0`), which is every overhead catch filmed tight. The fix is cheap: keep going, and re-acquire next to the hands.
- On 4 of 7 clips the plate path is the line the reel draws, from setup to catch. The other 3 fail on detection, not on tracking: dark silhouettes and motion blur. Hand-tuned masks and Hough each fix some clips and break others (wtPz). A learned plate/sleeve-end detector is the real fix.
- The plate and wrist paths differ a lot: 15-35 cm side-on (the wrist keypoint sits above the bar, and the far wrist is a guess), and 70 cm at 32° off, where the near plate is a bar-half-length from the hands. Every drift number in cm would change if the path source changed.

## What the app would need

1. **Plate tracker (`modules/pose-coreml/ios/Stages/Plates.swift`)**
   - Seed by rim support rather than by size.
   - `trackPlateStep` must not end the track on one miss or when the plate's top leaves the frame. Re-acquire around `wrist + offset`, let the size follow refits, and add a KLT hub step (Vision `VNTrackObjectRequest` or Core Image optical flow).
   - Then measure on device. Likely follow-up: a small Core ML plate/sleeve-end detector, which these numbers argue for.
2. **Analysis contract (`src/analysis/types.ts`)**
   - `Rep.path` gains a per-point source (`plate` | `wrist`).
   - A reference block per rep: start x, knee y, hip y, peak y, ring frame and its reason.
   - The CV worker fills the same fields.
3. **`src/features/analysis/PlayerScreen.tsx` (DrawLayer)**
   - New layers: the vertical start line, knee/hip/peak lines with labels (thin, ~60% opacity), and the ring on the plate at the cue frame (with a hold).
   - The plate path drawn in flare, falling back to the wrist path, blended, where the plate is lost.
4. **`modules/clip-transcoder/ios/ShareRenderer.swift`**: the same layers burned into the shared video.
5. **Movement gate**: the plate path and its overlay only for snatch and clean & jerk filmed side-on. Every other movement and angle keeps today's wrist path.
