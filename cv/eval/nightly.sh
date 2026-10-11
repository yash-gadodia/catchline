#!/bin/zsh
# Nightly Catchline CV eval on the Mac Mini, against whatever was last synced into $ROOT (see README).
set -u
export PATH=/opt/homebrew/bin:$PATH
ROOT=${CATCHLINE_EVAL_ROOT:-$HOME/catchline-eval}
CV_DIR=${CV_DIR:-$ROOT/pipeline}
LABELS=${LABELS:-$ROOT/research/labelling/labels/labels.jsonl}
[[ -s $LABELS ]] || LABELS=$ROOT/research/eval/provisional-index-labels.jsonl
cd "${0:A:h}/.."
echo "== $(date '+%F %T') labels=$LABELS"
"$CV_DIR/.venv/bin/python" -u eval/run_eval.py \
  --manifest "$ROOT/research/reference/side-on/INDEX.md" \
  --labels "$LABELS" --cv-dir "$CV_DIR" \
  --cache "$ROOT/cache" --out-root "$ROOT/out" --gate
echo "== exit $?"
