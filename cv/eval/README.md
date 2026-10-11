# Catchline CV eval harness

Runs the pipeline (`cv/run.py`) on every clip in a manifest, joins coach labels and scores the output against the launch targets in `liftcheck-research/15-tech-stack.md` 6.2. Stdlib only; the pipeline runs in its own venv.

```sh
cd cv
python eval/run_eval.py                       # defaults: side-on INDEX.md, labelling/labels/labels.jsonl, ~/dev/parallax/cv
python eval/run_eval.py --labels <file> --gate   # exit 1 unless every target passes
python eval/run_eval.py --write-provisional ~/dev/liftcheck-research/eval/provisional-index-labels.jsonl
```

Output: `~/dev/liftcheck-research/eval/<date>/report.md` and `metrics.json` (metrics plus a record per clip).

## Inputs

- **Manifest** (`--manifest`, repeatable): an `INDEX.md` table (clip, movement, reps, made/missed, lift windows in seconds) or a video glob such as `reference/*.mov` (no rep or result data). The rep count and lift windows always come from the manifest.
- **Labels** (`--labels`): JSONL, one row per coach per rep. The documented schema (`made`, `primary_fault`, `secondary_fault`, `cue_text`) and the labelling tool's names (`outcome`, `primary`, `secondary`, `cue`) are both read. Clip ids may be `folder/stem` or `stem`. Fault ids may be taxonomy codes (`S2`) or snake ids (`hips_rise_early`); see `FAULT_ALIASES` in `labels.py`. `"none"` means no fault and `null` means not labelled. A missing `rep` counts as rep 1. Rows with `skipped` are dropped. When a coach labels the same clip and rep more than once, the latest row wins.
- **Provisional labels**: `--write-provisional` builds labels from the manifest (movement and made/missed only, coach `index-provisional`, no faults). They measure rep detection and made/missed before coaches have labelled anything.

## Label join

- **Majority vote** per rep, separately for the primary fault, made and secondary.
- **2+ coaches on a clip**: every rep needs at least 2 coaches agreeing on the primary fault, or the whole clip is dropped (`excluded_coach_disagreement`).
- **One coach**: the clip is kept and marked provisional.
- **Kappa**: Fleiss' kappa on the primary fault, over reps that have 2+ coach ratings.

## Metrics

All of these are on the supported movements (snatch, power snatch).

- **Rep detection**: per clip, the share where the CV rep count equals the labelled count. Rep recall and precision come from matching each labelled rep to a CV rep by overlap with the manifest's lift window (in order when the windows do not line up 1:1). Also reports the rep-count MAE.
- **Made/missed agreement**: over matched reps, with a label→CV confusion.
- **Abstain rate**: clips with reps where the pipeline gave no cue (failures included).
- **Cue precision**: CV `cue.faultId` == the coach primary of the rep the cue's evidence points at.
- **Harmful-cue rate**: a cue counts as harmful when both of these hold:
  - the cued fault is absent, meaning it is neither the primary nor the secondary on any rep;
  - the coaches' primary fault is one the cue would make worse, per the provisional `HARMFUL` table in `score.py` (below; it needs coach sign-off).
- **Unsupported movements**: correctly rejected when the pipeline returns 0 reps.
- **Breakdowns**: per movement, per fault (precision, recall) and the coach→CV fault confusion.

| CV cue | Harmful when coaches' primary is | Why |
|---|---|---|
| jump_forward | excessive_backward_lean | "Land where you started" pulls the landing back on a lifter already too far back |
| catching_forward | excessive_backward_lean | moves the catch back on a lifter already behind the bar |
| bar_forward_off_hips | excessive_backward_lean, early_arm_bend | pulls the bar back into a backward lean; "brush the bar" invites arm pulling |
| hips_rise_early | bar_far_from_shins | "chest up" puts the shoulders further behind a bar already over the toes |
| excessive_backward_lean | catching_forward, jump_forward | "stay over the bar" moves the catch further forward |

## Gate (`--gate`)

| Target | Rule |
|---|---|
| Kappa | >= 0.6 |
| Cue precision | >= 0.8 |
| Harmful-cue rate | < 5% |

- **Status**: each target is `pass`, `fail` or `not_measured`.
- **Blocked**: cue precision and the harmful rate are `blocked_by_kappa` until kappa passes. The numbers are still shown, but they do not count as a pass.
- **Failing**: anything short of `pass` fails the gate. So today, with no fault labels, the gate fails by design.

## Caching

- **Results**: cached in `<cache>/runs/<clip>-<clip sha256[:12]>-<code sha[:12]>/`. The code sha hashes `catchline_cv/*.py`, `run.py`, `pyproject.toml` and `uv.lock`, so any pipeline change reruns every clip.
- **Pose**: cached by the pipeline itself in `<cache>/runs/cache/`, keyed by file name only. Delete it after changing pose decoding.
- **Clip hashes**: memoised by path, size and mtime in `<cache>/hashes.json`.
- **Crashes**: not cached.

## Running on the Mini

```sh
rsync -a --delete --exclude .venv --exclude out --exclude __pycache__ ~/dev/parallax/cv/ mini:catchline-eval/pipeline/
rsync -a --delete --exclude __pycache__ ~/dev/parallax/cv/eval mini:catchline-eval/harness/
rsync -a --exclude '*.jpg' ~/dev/liftcheck-research/reference/side-on mini:catchline-eval/research/reference/
rsync -a ~/dev/liftcheck-research/eval/provisional-index-labels.jsonl mini:catchline-eval/research/eval/
rsync -a ~/dev/liftcheck-research/labelling/labels mini:catchline-eval/research/labelling/   # once coaches label
ssh mini 'export PATH=/opt/homebrew/bin:$PATH; cd ~/catchline-eval/pipeline && uv sync'
ssh mini 'cd ~/catchline-eval/harness && nohup zsh eval/nightly.sh > ~/catchline-eval/run.log 2>&1 &'
rsync -a mini:catchline-eval/out/ ~/dev/liftcheck-research/eval/
```

## Nightly (not loaded)

`nightly.sh` runs the harness with `--gate` against the last-synced pipeline. It uses the coach labels when they exist and falls back to the provisional ones otherwise. `com.catchline.eval-nightly.plist` runs it at 03:00 and logs to `~/catchline-eval/nightly.log`. To enable it on the Mini:

```sh
ssh mini 'cp ~/catchline-eval/harness/eval/com.catchline.eval-nightly.plist ~/Library/LaunchAgents/ && \
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.catchline.eval-nightly.plist'
```

It does not sync code or labels itself: the rsync lines above are what keeps the Mini current.

## Tests

`tests/test_eval.py` covers manifest parsing, both label schemas, the consensus rules, kappa, window matching and every metric and gate path. It uses the synthetic fixture in `eval/fixtures/` and no video.
