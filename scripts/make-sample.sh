#!/bin/sh
# The tracked lift the welcome screen plays: scripts/make-sample.sh <lift folder>
# The folder holds a tracked lift's clip (c.mp4 or clip.mp4), analysis.json and body.json (Documents/lifts/<id>/ on a phone).
# Writes assets/sample/{clip.mp4,analysis.json,body.json}: the clip about 480 px wide, every frame kept, no sound.
set -eu
src="$1"
out="$(dirname "$0")/../assets/sample"
clip="$src/c.mp4"
[ -f "$clip" ] || clip="$src/clip.mp4"
mkdir -p "$out"
ffmpeg -v error -y -i "$clip" -an -vf "scale=480:-2" -fps_mode passthrough -c:v libx264 -preset veryslow -crf "${CRF:-24}" -pix_fmt yuv420p -movflags +faststart "$out/clip.mp4"
cp "$src/analysis.json" "$out/analysis.json"
cp "$src/body.json" "$out/body.json"
ls -l "$out"
