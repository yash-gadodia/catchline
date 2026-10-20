#!/bin/bash
# Puts the compiled pose models into modules/pose-coreml/ios/models/, which the podspec bundles
# into the app (PoseCoreMLModels.bundle), so 3.1 analyses offline from the first launch.
#   scripts/fetch-pose-models.sh            the tag + SHA-256s pinned in modules/pose-coreml/models.lock
# Runs on the EAS macOS builder (package.json "eas-build-pre-install"); run it by hand once before
# `npx expo run:ios`. Idempotent: a model already unpacked from the pinned archive is kept.
# New weights: scripts/publish-pose-models.sh <tag> (Yash), then put its tag + SHA-256s in models.lock.
set -euo pipefail
if [ "${EAS_BUILD_PLATFORM:-ios}" = "android" ] || [ "$(uname)" != "Darwin" ]; then
  echo "pose models are iOS only; skipped"
  exit 0
fi
root=$(cd "$(dirname "$0")/.." && pwd)
lock="$root/modules/pose-coreml/models.lock"
models="$root/modules/pose-coreml/ios/models"
tag=$(awk '$1 == "tag" { print $2 }' "$lock")
[ -n "$tag" ] || { echo "no tag in $lock"; exit 1; }
mkdir -p "$models"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
awk '$1 != "tag" && NF == 2' "$lock" | while read -r name sha; do
  stamp="$models/.$name.sha256"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sha" ]; then
    echo "$name: up to date ($tag)"
    continue
  fi
  echo "$name: downloading $tag"
  curl -fsSL --retry 3 -o "$tmp/$name.aar" "https://github.com/yash-gadodia/catchline/releases/download/$tag/$name.mlmodelc.aar"
  got=$(shasum -a 256 "$tmp/$name.aar" | awk '{ print $1 }')
  [ "$got" = "$sha" ] || { echo "$name: checksum $got, expected $sha"; exit 1; }
  rm -rf "$models/$name.mlmodelc"
  aa extract -d "$models" -i "$tmp/$name.aar"
  [ -d "$models/$name.mlmodelc" ] || { echo "$name: archive did not unpack to $name.mlmodelc"; exit 1; }
  echo "$sha" > "$stamp"
  echo "$name: ok ($sha)"
done
