# Plate model spike (11 Nov 2026)

Question: can a small trained model find the near plate's centre and size well enough to replace the hand-written plate
rules (`modules/pose-coreml` `Stages/Plates.swift`, `follow_plate`)? Nothing here is wired into the app.

## Idea

No full-frame detection. Pose already gives the wrists on every frame and the bar is in the hands, so the model sees one
256 px square, 1.6 lifter-box heights wide, centred between the wrists. **PlateNet** (`platenet.py`): torchvision
MobileNetV3-small (BSD, ImageNet weights) + a light top-down neck, CenterNet-style head at stride 4: centre heat, sub-cell
offset, log radius. 0.90 M parameters. Confidence = the heat peak. No Ultralytics code or weights anywhere.

## Pipeline (all on the Mac Mini, `~/catchline-plate-model`, data and weights stay there)

| step | script |
|---|---|
| context squares (2.4 body heights, 384 px JPEG) + the rule tracker's labels per frame | `extract.py`, `extract2.py`, `addpath.py` |
| look at the labels, clip by clip | `sheet.py` |
| hand labels in two passes (grid, then zoom with the label drawn back) | `gridsheet.py` |
| pick trusted clips and frame ranges (the review's verdicts are the table in the file) | `build_train.py` |
| train (MPS, about 12 min) | `train.py` |
| threshold on validation clips, never on test | `valsweep.py` |
| held-out table against the rules, overlays | `evaltest.py` |
| Core ML FP16 + timing | `export_coreml.py` |

## Data

- Train: 3,219 pseudo-labelled frames from 17 clips (4 phone clips weighted 3x, 9 older owner clips, 4 public) + 389
  plate-free frames from 3 pull-up clips. Pseudo-labels are the rule tracker's own output on clips where a by-eye review
  of contact sheets found it on the plate; 6 clips or tails of clips were thrown out (wrong plate, drifted, bar dropped).
- Validation (threshold only): 2 owner clips + 1 pull-up clip, pseudo-labelled.
- Test, never trained on: 6 phone clips + 3 other clips, **110 hand-labelled frames** (86 with the hands on the bar),
  plus 10 frames marked "plate centre outside the video frame", plus 3 no-barbell clips (654 frames) for false positives.
  There were no hand plate labels before this spike: `~/catchline-joints311/labels` are joint labels.
- Augmentation: crop scale so the plate is 10-80% of the crop, shift, rotation, flip, hue / saturation / gamma /
  contrast, motion blur along a random direction, noise, limb-like occluders, and crops that leave the plate out.

## Result (v1, hand labels only; share of labelled frames)

Rules = the point the shipped pipeline draws when it reads the path off the plate; a wrist fallback counts as "no plate".

| set | frames | model <=0.25 r | <=0.5 r | no plate | rules <=0.25 r | <=0.5 r | no plate |
|---|---|---|---|---|---|---|---|
| 6 held-out phone clips, thr 0.5 | 84 | 81% | 83% | 17% | 0% | 12% | 80% |
| same, thr 0.3 | 84 | 88% | 93% | 4% | | | |
| 3 other held-out clips, thr 0.5 | 26 | 88% | 92% | 8% | 46% | 46% | 54% |
| hands on the bar only, all 9 clips, thr 0.5 / 0.3 | 86 | 85% / 93% | 87% / 98% | 13% / 0% | 14% | 26% | 67% |

False positives on 3 clips with no barbell: 0%, 3.9%, 0% of frames at thr 0.5 (0%, 13.9%, 1% at 0.3). Threshold 0.5 was
chosen on the validation clips. Weakest clip: IMG_1177 (camo plates at 45 degrees), 33% at thr 0.5; it once picks the far
plate. The naive median smoothing pass in `evaltest.py` made things slightly worse (it lags the pull), so it is not the
temporal model to ship.

Core ML: 1.9 MB FP16 ML Program; on the M4 Mini 0.3 ms per crop with the Neural Engine, 1.6 ms CPU only.

## Second round (same evening)

- Label definition: the plate at the end of the lifter's bar NEAREST the camera. `evaltest.py --far` counts "picked the
  far plate" on the 36 test frames where I marked both plates (IMG_1177, IMG_1559, IMG_1561): PlateNet 0 of 36 at thr 0.5
  (1 at thr 0.3, IMG_1177), rules 5 (IMG_1561 overhead).
- Candidates: the head's three best heat peaks per frame. The true plate is within 0.25 r of one of them on 92% of the
  84 phone frames, so a one-tap choice among candidates would recover about half of the frames the top pick misses.
- Owner labels (`~/catchline-plate-data/owner_labels.json`, `evaltest.py --owner`) replace mine per clip as they arrive.
  First 12 (IMG_0596): PlateNet 92% within 0.25 r, 100% within 0.5 r, the same as against my own labels there.
- Public Roboflow sets: not used. The pages and the API need an account key; licences of three of the four unconfirmed.
- RF-DETR Nano (Apache 2.0) as a full-frame alternative: `build_coco.py` + `rfdetr_run.py` are written, **not measured**.
  The Mac Mini kernel-panicked minutes into its training run (30 M params on a shared 16 GB machine). Do not train it
  there while anything else runs.

## Not verified

- No iPhone timing, and no run on AVFoundation-decoded pixels (training frames were decoded by OpenCV/ffmpeg from HLG clips).
- The other 10 of the 13 joint-labelled clips were not hand-labelled for the plate (no extracted pose crops for them).
- Hand labels are one labeller's reading off a zoomed grid, about 2 px in a 256 px crop.
- Only 4 phone clips trained the model; the 6 new clips in `~/catchline-plate-data/clips` were not used.
