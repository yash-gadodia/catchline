# Catchline CV spike

Phone video of a lift in, one `Analysis` JSON (v1, `src/analysis/types.ts`) out. Runs on the Mac Mini, CPU only.
Movements: `snatch` (below), `clean`, `jerk`, `kipping_pull_up`, `bar_muscle_up`, `kipping_hspu` (`--movement`; see "Other movements").

## Run (on the Mini)

```sh
# from the laptop: sync code, then run there
rsync -a --exclude .venv --exclude out ~/dev/parallax/cv/ mini:catchline-cv/cv/
ssh mini 'export PATH=/opt/homebrew/bin:$PATH; cd ~/catchline-cv/cv && uv sync && \
  uv run python run.py ../clips/snatch-2026-09-20.mov --id snatch-real'
ssh mini 'export PATH=/opt/homebrew/bin:$PATH; cd ~/catchline-cv/cv && uv run pytest -q'
```

Output in `out/<id>/`: `<id>.json`, `keyframes/*.jpg` (1080 px tall) and `debug/` (per-rep overlay mp4, contact sheets, signal plot, `json-check.jpg`).
Pose is cached in `out/cache/` so rule/phase changes rerun in ~20 s. `--no-video` skips the overlay mp4.
`scripts/verify_json.py <json> <root> <out.jpg>` draws the JSON's own normalised path and evidence on its keyframes (checks the contract, not the internals).

To ship into the app: copy `<id>.json` to `src/analysis/fixtures/` and `keyframes/` to `assets/analysis/<id>/`; `KeyFrame.image` is `assets/analysis/<id>/<file>` (repo-relative).

## Pipeline

1. **Decode** with ffmpeg (applies the rotation metadata), scaled to 1280 px tall for inference.
2. **Pose**: rtmlib `BodyWithFeet` balanced (YOLOX-m person detector + RTMPose-m Halpe26, both Apache-2.0, ONNX on CPU), every frame, every person.
3. **Lifter**: seed on the largest confident person box, follow by box IoU; reps need the wrists to go floor (below knees) to overhead (above nose).
4. **Camera motion**: KLT on the background (people and the bar band masked out) + RANSAC similarity, chained to the rep window's first frame. All measurements are in that stabilised frame.
5. **Bar**: the trace is the **wrist midpoint** (the bar centre between the hands). On this clip the near plate leaves the top of the frame overhead, so the plate cannot be the trace end to end.
   **Plates** (no learned detector): a colour mask (dark rubber or green fleck) and a sampled ellipse search along the wrist line beyond each hand. The score is fill inside a vertical ellipse minus fill in a ring just outside. It finds both plates at setup and re-detects the near plate each frame for tracking.
   - **Scale:** pxPerCm comes from the 45 cm plate height. It is the harmonic mean of the near and far plates, which gives the scale at the bar centre's depth.
   - **Camera angle:** it is the median of three estimates: the plate-centre span, and each plate's ellipse (minor/major = cos θ).
   - **Cross-check:** the plate trace validates the wrist trace through the pull, as the correlation of their vertical velocities.
   - **Side-on** (hands overlap, < 0.15 of body height apart): only the near plate is visible. It is found in a box under the hands, sized by the crouched setup box, and the search keeps the largest close-scoring disc. A RANSAC ellipse is then fitted to the mask outline at two opening scales, which drops the floor shadow, the shoes and the sleeve notch. The near plate sits ~75 cm closer to the camera than the lifter, so its size alone overstates the scale. **Scale** = near-plate scale × (wrist px rise ÷ plate px rise over the pull), since a rigid bar rises the same cm at both depths. The ratio is a least-squares slope with an intercept (not anchored at lift-off, where the far wrist is a guess) and the plate track is refined to 0.005 plate heights (the coarse 0.05 grid made the rise step in ~11 px jumps); both made the scale move ~18% between encodings of one clip. When one wrist strays from the other by more than 12% of body height, it is a guess made behind the plate, and the bar uses the wrist that continues its path.
6. **Phases** (`phases.py`, pure): lift-off (bar leaves floor), double knee bend from knee-angle extrema (first extension → re-bend → second extension), turnover peak (first real local max of bar height; a squat snatch stands up higher later), catch (first elbow lockout ≥150° from the peak). The catch phase runs to the catch bottom, the lowest bar point before the stand-up gets halfway back, for squat and power ride-downs alike, and only inside the overhead hold (so the bar being lowered or dropped is ignored). Recovery runs until the bar is 90% back up. **Made** means it recovered and the knees straighten (>150°) within 0.5 s. A rep only ends when the bar comes back below the knees. **Catch type**: a squat catch if the knee goes under 65° in the catch, otherwise a power catch (`catch_depth` measurement).
7. **Rules** (`rules.py`, from 03-fault-taxonomy.md):
   - **Hips rise early.** Hip rise minus shoulder rise from lift-off to the bar passing the knee, threshold 8 cm. It uses vertical distances only, so it is robust to the camera angle; the taxonomy's 12° back-angle drop ≈ 9 cm for a 50 cm torso.
   - **Bar forward off hips.** Forward bar excursion from hip contact to the peak, threshold 10 cm.
   - **Jump forward.** Ankle-midpoint shift from lift-off to the catch, threshold 5 cm (lenient for phone noise): median over the 0.3 s before lift-off (feet planted) vs the 0.3 s from the catch (landed), since the catch frame moves a frame or two between encodings while the feet are still travelling.
   - **Angle correction.** Horizontal values are divided by cos(camera angle).
   - **Picking the cue.** The most severe fault wins.
   - **Confidence.** It is capped to `low` for horizontal faults filmed more than 20° off side-on. It is `clear` only when the fault fires on every rep, and on at least two reps.

## Other movements (`lifts.py`, `gym.py`, `movement.py`)

- **Movement check.** The app passes the movement. Camera motion is removed for the whole clip (background KLT on 360 px frames), then the body says which family it is: **inverted** (ankles over shoulders for 1 s+), **hanging** (with the hands above the hips, the feet travel more than 2x the hands: a fixed bar), **barbell** (floor to above the hips, or a 0.5 s hold at the shoulders). A clear mismatch (a snatch tagged as a pull-up) is `unsupported_movement`; an unclear clip goes on to the analysis.
- **Clean.** The snatch's per-rep analysis (plates, scale, stabilisation, double knee bend) with the catch = the first **front-rack** frame after the peak: bar (wrist midpoint) at shoulder height, wrists above the elbows, elbows forward of the shoulders (dropped when filmed front-on). The window ends with the rack hold, so a following jerk is not the peak. Faults: hips rise early, bar forward off hips, jump forward (as the snatch), **early arm bend** (both elbows < 160° for good, before the hip's widest angle; 0.1 s), **incomplete extension** (max hip angle short of 170°; 8°).
- **Jerk.** Reps are a 0.3 s hold at the shoulders followed by one overhead. Phases: setup, drive (dip start to the bar leaving the shoulders), turnover (to landing = the knees' lowest point after the drive), catch, recovery. Split vs push from the front-back ankle gap (> 0.3 leg). Faults: **forward dip** (4 cm), **press-out** (elbow < 160° on landing and +15° within 0.3 s), **chest dive** (trunk 15° forward on landing), **bar forward overhead** (bar vs shoulders at lockout, 6 cm; the taxonomy's ear is a head point we no longer keep). Scale from body segments (no plate search at the shoulders).
- **Gymnastics** (`traceKind: 'hip'`, path = hip trail). Reps from shoulder-height cycles (camera motion removed). Bar line = median wrist height while hanging, lifted 0.12 torso; HSPU wall = the heels at the top. Scale from body segments (shoulder-hip-knee-ankle ≈ 132 cm, ±8%). The cue is the earliest fault in the causal chain that fires on 2+ reps (23 §6.1).
  - Kipping pull-up: **K2** knee range > 50° arch to top, **K1** elbows bent for good ≥ 0.13 s before the hip snap (fastest hip opening after the hollow), **K3** shoulders move back < 4 cm in 0.4 s after the top (not judged on the last rep). Standard: chin over bar, estimated as shoulders + 12 cm.
  - Bar muscle-up: **B1** hips > 45 cm under the bar when the elbows break, **B2** hips peak > 30 cm under the bar before the first elbow goes over, **B3** L/R elbow heights > 12 cm apart at that moment (only with both elbows scored > 0.5). Standards: lockout elbow angle in support, shoulders over the bar.
  - Kipping HSPU: pose runs twice (upright and 180° rotated, more confident pose per person kept; a rotation keeps left/right, so no swap). **H2** hip > 10 cm off the shoulder-ankle line, away from the wall, at lockout; **H1** press (fastest elbow extension) outside 0-0.25 s after the drive (fastest knee extension), 0.1 s. Standards: lockout elbow, tuck angle, depth.
- **Cue copy** is the 25-cue-library.md section 4 table: the primary cue per fault and its why template with the measurement in section 5 units (integers; 1 cm, 2 deg, 10 ms). Two deviations: J7 says "shoulder line" not "ear" (no head points), and S1's library cue is 8 words. Causal gating: bar swing over jump, hips-rise over early arm bend, B2 over B3, H2 over H1. H1 is measured as the library's template reads it (knees above the hips at the deepest tuck, 10 cm); the drive-to-press timing is a measurement row.
- **Outcome first** (26-mistakes-misses.md 8.1): a rep that is not made is classified by where the bar left the lifter (bar vs mid-foot and its direction): missed forward / missed behind (snatch, clean), could not stand (clean: racked, hips never past 120°; chest > 25° forward gets the rack cue, else "strength at this weight"), jerk dumped forward (bar > 5 cm in front of the shoulder line) / back (> 8 cm behind). A miss gets its own card. Missed behind (8.2) reports the earliest of: loop (bar > 10 cm forward off the hips and back faster than 55 cm/s), hips through (hip > 6 cm past the ankle, trunk > 10° past vertical, or feet > 5 cm back), dive (chest > 20° forward with the hip < 170°), else position only ("I can't see why"), always with the bail line; the forward step after a miss behind is the bail and is not judged as a jump forward. Press-out (8.3) = elbow still straightening after the hips' lowest point. Not built: crash/lost-under (needs 60 fps bar speed and a load), heel-rise ("feet") cause, make-vs-miss deltas, jump-back.
- **Camera angle without plates**: from how far apart the L/R shoulders and hips sit in x. Projection-sensitive faults (horizontal distances, joint angles, timings from angles) are `low` past 20°; `clear` needs the fault on every rep and on 2+.

## Privacy

- Head keypoints (nose, eyes, ears, head top) are dropped straight after pose inference (`pose.strip_head`), so they are never cached, measured or stored. Anything that needed the nose uses a body stand-in (half a torso above the shoulders).
- Keyframes are exported with every non-lifter person blurred: a box from their body keypoints, padded and grown upwards over the head, minus the lifter's own silhouette (`privacy.py`). No face detector. `debug/keyframes-sheet.jpg` shows exactly what is exported. Debug overlays are not blurred (internal only).

## Known limits

- Built and tuned on one clip (two reps). Thresholds are the taxonomy's proposals, not validated.
- 45° front-side footage: horizontal distances are projected and corrected by an uncertain angle (estimates disagree, see the debug log); stance-width changes leak into the foot midpoint.
- Plate size is assumed 45 cm (the near plate is a 5 kg bumper; if it is a smaller technique plate every cm value scales).
- Wrist midpoint ≠ plate centre; it pivots a few cm around the bar in the turnover.
- `path` points are in each frame's own pixels (normalised). The camera barely moves on this clip (< 30 px drift), but on a panning clip a trail drawn over one frame would be offset.
