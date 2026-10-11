# Catchline CV spike

Phone video of a snatch in, one `Analysis` JSON (v1, `src/analysis/types.ts`) out. Runs on the Mac Mini, CPU only.

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
6. **Phases** (`phases.py`, pure): lift-off (bar leaves floor), double knee bend from knee-angle extrema (first extension → re-bend → second extension), turnover peak (first real local max of bar height; a squat snatch stands up higher later), catch (first elbow lockout ≥150° from the peak; catch phase runs to the squat bottom), recovery (stand until the bar is 90% back up).
7. **Rules** (`rules.py`, from 03-fault-taxonomy.md):
   - **Hips rise early.** Hip rise minus shoulder rise from lift-off to the bar passing the knee, threshold 8 cm. It uses vertical distances only, so it is robust to the camera angle; the taxonomy's 12° back-angle drop ≈ 9 cm for a 50 cm torso.
   - **Bar forward off hips.** Forward bar excursion from hip contact to the peak, threshold 10 cm.
   - **Jump forward.** Ankle-midpoint shift from lift-off to the catch, threshold 5 cm (lenient for phone noise).
   - **Angle correction.** Horizontal values are divided by cos(camera angle).
   - **Picking the cue.** The most severe fault wins.
   - **Confidence.** It is capped to `low` for horizontal faults filmed more than 20° off side-on. It is never `clear` unless every rep agrees.

## Known limits

- Built and tuned on one clip (two reps). Thresholds are the taxonomy's proposals, not validated.
- 45° front-side footage: horizontal distances are projected and corrected by an uncertain angle (estimates disagree, see the debug log); stance-width changes leak into the foot midpoint.
- Plate size is assumed 45 cm (the near plate is a 5 kg bumper; if it is a smaller technique plate every cm value scales).
- Wrist midpoint ≠ plate centre; it pivots a few cm around the bar in the turnover.
- `path` points are in each frame's own pixels (normalised). The camera barely moves on this clip (< 30 px drift), but on a panning clip a trail drawn over one frame would be offset.
