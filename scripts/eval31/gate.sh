#!/usr/bin/env bash
# The real-clip release gate: the owner's clips through the phone pipeline on the Mac Mini, compared with
# scripts/eval31/gate-baseline.json. Run it from the laptop; it drives the Mini over ssh.
#   scripts/eval31/gate.sh --check      every clip, prepared and tracked as the phone does it (15-25 min); exit 1 on a regression
#   scripts/eval31/gate.sh --replay     only the TS rules on the baseline's saved traces (seconds); for TS-only changes
#   scripts/eval31/gate.sh --record     a full run that becomes the new baseline (commit gate-baseline.json after it)
#   scripts/eval31/gate.sh --original   a full run on the untouched files, to see what preparing the clip changes; never a gate result
#   scripts/eval31/gate.sh --sheets     draw the overlays of the last full run and fetch one contact sheet per clip to .gate/sheets/
#   scripts/eval31/gate.sh --require [--full]   what ota.sh and store-build.sh ask: is there a passing result for this commit?
# Fails when a clip loses its plate path, plate share falls more than 10 points, a clip that tracked now fails,
# joints seen falls more than 3 points, a no-barbell clip gets a bar path, or the run crashes.
# What a commit needs (--require): files that change the prepared clip or the native passes -> --check; TS tracking
# rules only -> --replay is enough; neither -> nothing, the baseline stands. --full (store builds) never accepts a replay.
# Emergency override: GATE_SKIP="<reason>" makes --require pass with a loud warning, logged in .gate/overrides.log.
# Env: MINI (ssh host, mini), GATE_DIR (catchline-gate, under the Mini's home), GATE_WAIT_MIN (30: how long to wait
# for the Mini's load to fall under 8), MODELS_SRC (where the Mini already has the two .mlmodelc).
set -euo pipefail
cd "$(dirname "$0")/../.."
MODE="${1:-}"
MINI=${MINI:-mini}
GATE_DIR=${GATE_DIR:-catchline-gate}
BASELINE=scripts/eval31/gate-baseline.json
CLIPS=scripts/eval31/gate-clips.json
LOCAL=.gate
mkdir -p "$LOCAL"
COMMIT=$(git rev-parse HEAD)
DIRTY=0; git diff --quiet HEAD || DIRTY=1

# Paths that change what the phone tracks. FULL: the prepared clip, the native passes, the gate itself.
FULL_RE='^(modules/(pose-coreml|clip-transcoder)/(ios|harness|models\.lock)|src/features/capture/(compress|trim)\.ts|src/data/prepare\.ts|scripts/eval31/gate(\.ts|-clips\.json))'
TS_RE='^src/analysis/'
NOT_RE='(\.test\.tsx?|/fixtures/.*|\.md)$'

mini() { ssh -o BatchMode=yes "$MINI" "export PATH=/opt/homebrew/bin:\$PATH; cd ~/$GATE_DIR 2>/dev/null || mkdir -p ~/$GATE_DIR && cd ~/$GATE_DIR; $1"; }
field() { node -p "JSON.parse(require('fs').readFileSync('$1','utf8')).$2 ?? ''" 2>/dev/null || true; }

needed() {
  [ -f "$BASELINE" ] || { echo "full no baseline recorded yet"; return; }
  local base; base=$(field "$BASELINE" commit)
  git cat-file -e "$base^{commit}" 2>/dev/null || { echo "full baseline commit ${base:0:7} is not in this clone"; return; }
  local changed; changed=$(git diff --name-only "$base" HEAD | grep -Ev "$NOT_RE" || true)
  local full ts
  full=$(echo "$changed" | grep -E "$FULL_RE" | head -3 | tr '\n' ' ' || true)
  ts=$(echo "$changed" | grep -E "$TS_RE" | head -3 | tr '\n' ' ' || true)
  if [ -n "$full" ]; then echo "full changed since the baseline (${base:0:7}): $full"
  elif [ -n "$ts" ]; then echo "replay TS tracking rules changed since the baseline (${base:0:7}): $ts"
  else echo "none no tracking or native file changed since the baseline (${base:0:7})"; fi
}

require() {
  local want_full="${1:-}" need reason
  read -r need reason <<<"$(needed)"
  if [ -n "${GATE_SKIP:-}" ]; then
    echo "################################################################################"
    echo "# GATE SKIPPED on ${COMMIT:0:7} (needed: $need). Reason: $GATE_SKIP"
    echo "# Nobody has checked that tracking still works on real clips for this commit."
    echo "################################################################################"
    echo "$(date -u +%FT%TZ) $COMMIT needed=$need reason=$GATE_SKIP" >> "$LOCAL/overrides.log"
    return 0
  fi
  if [ "$need" = none ]; then echo "gate: skipped, $reason."; return 0; fi
  [ "$need" = replay ] && [ "$want_full" = "--full" ] && need=full && reason="$reason (a store build needs the full check)"
  local f="$LOCAL/result-$COMMIT.json"
  local how="scripts/eval31/gate.sh --check"; [ "$need" = replay ] && how="scripts/eval31/gate.sh --replay (or --check)"
  [ -f "$f" ] || { echo "gate: no result for ${COMMIT:0:7}. $reason. Run: $how"; return 1; }
  [ "$(field "$f" pass)" = true ] || { echo "gate: the last run on ${COMMIT:0:7} FAILED. Fix it, then: $how"; return 1; }
  [ "$(field "$f" dirty)" = false ] || { echo "gate: the result for ${COMMIT:0:7} was run with uncommitted changes. Run: $how"; return 1; }
  [ "$(field "$f" baselineAt)" = "$(field "$BASELINE" at)" ] || { echo "gate: the baseline changed since the result for ${COMMIT:0:7}. Run: $how"; return 1; }
  if [ "$need" = full ] && [ "$(field "$f" mode)" != full ]; then echo "gate: ${COMMIT:0:7} has a replay result but needs the full check. $reason. Run: scripts/eval31/gate.sh --check"; return 1; fi
  echo "gate: passed on ${COMMIT:0:7} ($(field "$f" mode), $(field "$f" at))."
}

bundle_and_sync() {
  npx esbuild scripts/eval31/gate.ts --bundle --platform=node --format=cjs --log-level=warning --outfile="$LOCAL/gate.cjs"
  mini "mkdir -p src/modules/pose-coreml src/modules/clip-transcoder"
  rsync -a --delete --exclude .build --exclude models modules/pose-coreml/ios modules/pose-coreml/harness "$MINI:$GATE_DIR/src/modules/pose-coreml/"
  rsync -a --delete --exclude .build modules/clip-transcoder/ios modules/clip-transcoder/harness "$MINI:$GATE_DIR/src/modules/clip-transcoder/"
  rsync -a "$LOCAL/gate.cjs" "$CLIPS" scripts/eval31/render40.py "$MINI:$GATE_DIR/"
}

preflight() {
  local waited=0 load free
  free=$(mini "df -g /System/Volumes/Data | awk 'NR==2 {print \$4}'")
  [ "$free" -ge 5 ] || { echo "gate: the Mini has ${free} GB free; needs 5."; exit 3; }
  while :; do
    load=$(mini "sysctl -n vm.loadavg | awk '{print int(\$2)}'")
    [ "$load" -lt 8 ] && break
    [ "$waited" -ge "${GATE_WAIT_MIN:-30}" ] && { echo "gate: the Mini's load is still $load after $waited min. Not starting."; exit 3; }
    echo "gate: the Mini's load is $load (limit 8); waiting"; sleep 60; waited=$((waited + 1))
  done
  mini "if [ -f run.pid ] && kill -0 \$(cat run.pid) 2>/dev/null; then echo BUSY; fi" | grep -q BUSY && { echo "gate: another gate run is going on the Mini."; exit 3; }
  return 0
}

build() {
  mini "
    set -e
    if [ ! -d models/RTMPoseHalpe26.mlmodelc ]; then
      src=${MODELS_SRC:-\$HOME/catchline-v40/repo/modules/pose-coreml/ios/models}
      [ -d \$src/RTMPoseHalpe26.mlmodelc ] || { echo 'gate: no pose models on the Mini; set MODELS_SRC'; exit 3; }
      mkdir -p models && cp -cR \$src/*.mlmodelc models/
    fi
    sum=\$(find -L src/modules -name '*.swift' -not -path '*/.build/*' | sort | xargs shasum | shasum | cut -c1-40)
    if [ \"\$(cat built.sha 2>/dev/null)\" != \"\$sum\" ]; then
      echo 'gate: building the harnesses'
      (cd src/modules/pose-coreml/harness && swift build -c release --product harness 2>&1 | grep -E 'error|Compiling|Build complete' | tail -5)
      (cd src/modules/clip-transcoder/harness && swift build -c release 2>&1 | grep -E 'error|Build complete' | tail -5)
      test -x src/modules/pose-coreml/harness/.build/release/harness && test -x src/modules/clip-transcoder/harness/.build/release/track-share
      echo \$sum > built.sha
    fi"
}

# One clip at a time, one node process and one harness process at most.
full_run() {
  local work="$1" source="$2" started=$SECONDS seen=0 n
  bundle_and_sync; preflight; build
  mini "rm -rf $work && mkdir -p $work && rm -f run.log
    nohup sh -c 'node gate.cjs run --clips gate-clips.json --harness src/modules/pose-coreml/harness/.build/release/harness --transcoder src/modules/clip-transcoder/harness/.build/release/track-share --models models --work $work --out $work/result.json --source $source; echo exit=\$?' > run.log 2>&1 &
    echo \$! > run.pid"
  while :; do
    sleep 20
    n=$(mini "grep -c '^row ' run.log || true")
    [ "$n" -gt "$seen" ] && { mini "grep '^row ' run.log | tail -n +$((seen + 1))" | cut -c1-150; seen=$n; }
    mini "grep -q '^exit=' run.log && echo FIN || true" | grep -q FIN && break
    mini "kill -0 \$(cat run.pid) 2>/dev/null && echo ALIVE || true" | grep -q ALIVE || { mini "grep -q '^exit=' run.log && echo FIN || true" | grep -q FIN && break; echo "gate: the run died on the Mini:"; mini "tail -5 run.log"; exit 1; }
  done
  mini "grep -q '^exit=0' run.log" || { echo "gate: the run crashed:"; mini "tail -5 run.log"; exit 1; }
  rsync -a "$MINI:$GATE_DIR/$work/result.json" "$LOCAL/last-$source.json"
  echo "gate: full run took $(((SECONDS - started) / 60)) min $(((SECONDS - started) % 60)) s"
}

stamp() { # mode pass
  node -e "
    const fs=require('fs');const b=JSON.parse(fs.readFileSync('$BASELINE','utf8'));
    fs.writeFileSync('$LOCAL/result-$COMMIT.json',JSON.stringify({commit:'$COMMIT',dirty:$DIRTY===1,mode:'$1',pass:$2,baselineAt:b.at,at:new Date().toISOString()},null,1)+'\n')"
}

compare() { npx tsx scripts/eval31/gate.ts compare --clips "$CLIPS" --baseline "$1" --result "$2" ${3:-}; }

case "$MODE" in
  --record)
    [ "$DIRTY" = 0 ] || { echo "gate: commit first; a baseline belongs to a commit."; exit 1; }
    full_run run prepared
    [ -f "$BASELINE" ] && { compare "$BASELINE" "$LOCAL/last-prepared.json" --report || true; }
    node -e "
      const fs=require('fs');const r=JSON.parse(fs.readFileSync('$LOCAL/last-prepared.json','utf8'));
      const bad=Object.entries(r.clips).filter(([,c])=>c.error).map(([id])=>id);
      if(bad.length){console.error('gate: not recording, crashed on: '+bad.join(', '));process.exit(1)}
      fs.writeFileSync('$BASELINE',JSON.stringify({commit:'$COMMIT',...r},null,1)+'\n')"
    mini "rm -rf baseline && mv run baseline"
    compare "$BASELINE" "$BASELINE" --report
    stamp full true
    echo "gate: baseline recorded at ${COMMIT:0:7}. Look at the overlays (--sheets), then commit $BASELINE."
    ;;
  --check)
    [ -f "$BASELINE" ] || { echo "gate: no baseline; run --record first."; exit 1; }
    full_run check prepared
    if compare "$BASELINE" "$LOCAL/last-prepared.json"; then stamp full true; else stamp full false; exit 1; fi
    ;;
  --replay)
    [ -f "$BASELINE" ] || { echo "gate: no baseline; run --record first."; exit 1; }
    npx esbuild scripts/eval31/gate.ts --bundle --platform=node --format=cjs --log-level=warning --outfile="$LOCAL/gate.cjs"
    rsync -a "$LOCAL/gate.cjs" "$CLIPS" "$MINI:$GATE_DIR/"
    [ "$(mini "node -p \"require('./baseline/result.json').at\" 2>/dev/null || true")" = "$(field "$BASELINE" at)" ] || { echo "gate: the traces on the Mini are not this baseline's; run --check."; exit 1; }
    mini "node gate.cjs replay --clips gate-clips.json --work baseline --out replay.json > replay.log 2>&1 || { tail -5 replay.log; exit 1; }"
    rsync -a "$MINI:$GATE_DIR/replay.json" "$LOCAL/last-replay.json"
    if compare "$BASELINE" "$LOCAL/last-replay.json"; then stamp replay true; else stamp replay false; exit 1; fi
    ;;
  --original)
    [ -f "$BASELINE" ] || { echo "gate: no baseline; run --record first."; exit 1; }
    full_run original original
    echo "baseline = the prepared clip (what the phone tracks); now = the untouched file"
    compare "$BASELINE" "$LOCAL/last-original.json" --report
    ;;
  --sheets)
    WORK=${2:-baseline}
    mini "for d in $WORK/*/; do id=\$(basename \$d); [ -f \$d/prepared.mp4 ] && [ -f \$d/analysis.json ] && \$HOME/catchline-cv2/cv/.venv/bin/python render40.py \$d/prepared.mp4 \$d | tail -1; done"
    mkdir -p "$LOCAL/sheets"
    for id in $(node -p "require('./$CLIPS').map(c=>c.id).join(' ')"); do rsync -a "$MINI:$GATE_DIR/$WORK/$id/sheet.jpg" "$LOCAL/sheets/$id.jpg" 2>/dev/null || echo "no sheet for $id"; done
    echo "gate: sheets in $LOCAL/sheets/ (private: never commit them). Overlay videos stay on the Mini in ~/$GATE_DIR/$WORK/<id>/overlay.mp4"
    ;;
  --require) require "${2:-}" ;;
  --needed) needed ;;
  *) sed -n '2,17p' "$0"; exit 2 ;;
esac
