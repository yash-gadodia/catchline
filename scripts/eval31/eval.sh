#!/bin/bash
# One command from clips to a scoreboard on a Mac with the clip sets (the Mini): build the harness, bundle the runner,
# build the clip list, run every clip (pose and pixel stages cached), score.
#   scripts/eval31/eval.sh [--sets owner,public] [--only id,id]
# Env: EVALSET (~/catchline-evalset), OWNER (~/catchline-scale-work/eval608), GOLDEN dirs, DESIGN (labels + compare.jsonl),
# MODELS (the two .mlmodelc), WORK (cache + out, default ~/catchline-eval).
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=${WORK:-$HOME/catchline-eval}
EVALSET=${EVALSET:-$HOME/catchline-evalset}
OWNER=${OWNER:-$HOME/catchline-scale-work/eval608}
GOLDEN=${GOLDEN:-$HOME/catchline-perf/clips_all}
DESIGN=${DESIGN:-$WORK/design}
MODELS=${MODELS:-$ROOT/modules/pose-coreml/ios/models}
mkdir -p "$WORK/out" "$WORK/cache"
HARNESS_DIR=$ROOT/modules/pose-coreml/harness
if [ -z "${SKIP_BUILD:-}" ]; then
  (cd "$HARNESS_DIR" && swift build -c release --product harness 2>&1 | grep -E "error|Build complete" | tail -3)
fi
BIN=$HARNESS_DIR/.build/release/harness
BUNDLE=$WORK/eval31.cjs
if [ -z "${SKIP_BUNDLE:-}" ]; then
  (cd "$ROOT" && npx esbuild scripts/eval31/run.ts --bundle --platform=node --format=cjs --log-level=warning --outfile="$BUNDLE")
fi
node "$BUNDLE" sets --evalset "$EVALSET" --owner "$OWNER" --golden "$GOLDEN" --design "$DESIGN" > "$WORK/clips.json"
node "$BUNDLE" run --clips "$WORK/clips.json" --harness "$BIN" --models "$MODELS" --cache "$WORK/cache" --out "$WORK/out" "$@"
node "$BUNDLE" score --clips "$WORK/clips.json" --out "$WORK/out" > "$WORK/scoreboard.json"
echo "scoreboard: $WORK/scoreboard.json"
