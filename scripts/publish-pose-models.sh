#!/bin/bash
# Publish new on-device pose weights as the GitHub release asset PoseModelStore.swift downloads.
#   scripts/publish-pose-models.sh <tag>          e.g. models-pose-v2
# Needs: the exported models in modules/pose-coreml/ios/models/{YoloxHuman,RTMPoseHalpe26}.mlmodelc
# (cd cv && uv run --with coremltools --with onnx2torch --with torch --with onnx python scripts/export_coreml.py),
# `aa` (macOS) and `gh` logged in with write access to yash-gadodia/catchline. Yash runs this, never an agent.
# Afterwards set poseModelReleaseTag and the two SHA-256s in modules/pose-coreml/ios/PoseModelStore.swift to what it
# prints, and ship a new binary: the models change numbers (re-record the goldens).
set -euo pipefail
tag=${1:?tag, e.g. models-pose-v2}
root=$(cd "$(dirname "$0")/.." && pwd)
models="$root/modules/pose-coreml/ios/models"
out=$(mktemp -d)
for name in YoloxHuman RTMPoseHalpe26; do
  [ -d "$models/$name.mlmodelc" ] || { echo "missing $models/$name.mlmodelc (export first)"; exit 1; }
  aa archive -d "$models" -subdir "$name.mlmodelc" -o "$out/$name.mlmodelc.aar"
done
(cd "$out" && shasum -a 256 ./*.aar | tee sha256.txt)
notes="Compiled Core ML models for modules/pose-coreml, downloaded by the app on first use and pinned by SHA-256.
Built by cv/scripts/export_coreml.py (rtmlib balanced: YOLOX-m humanart + RTMPose-m body7 halpe26, FP32), packed with \`aa archive -d models -subdir <name>.mlmodelc -o <name>.mlmodelc.aar\`.
Weights: YOLOX (Apache-2.0), RTMPose / MMPose (Apache-2.0).

sha256
$(cat "$out/sha256.txt")"
gh release create "$tag" "$out"/*.aar --repo yash-gadodia/catchline --title "On-device pose models ($tag)" --notes "$notes"
echo "released $tag; now pin the tag and these SHA-256s in modules/pose-coreml/ios/PoseModelStore.swift"
