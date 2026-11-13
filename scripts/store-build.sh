#!/usr/bin/env bash
# The way to a store build: the checks, the real-clip gate on this commit, then the commands to run by hand.
#   scripts/store-build.sh
# It builds and submits nothing. A store build always needs the full gate (never a replay); if this commit has no
# passing result it runs scripts/eval31/gate.sh --check now (15-25 min on the Mini).
# Emergency override: GATE_SKIP="<reason>" scripts/store-build.sh (loud, logged in .gate/overrides.log).
# What must be watched before and after the build: .claude/skills/release-verify/SKILL.md.
set -euo pipefail
cd "$(dirname "$0")/.."
git diff --quiet HEAD || { echo "store-build: tracked changes are not committed; a build must equal a commit."; exit 1; }
scripts/eval31/gate.sh --require --full || { [ -z "${GATE_SKIP:-}" ] && scripts/eval31/gate.sh --check; }
npm run qa
VERSION=$(node -p "require('./app.json').expo.version")
STORE=$(node -p "const s=require('./scripts/store-build.json');s.version+' build '+s.build+' ('+s.sha.slice(0,7)+')'")
cat <<OUT

store-build: gate and checks passed on $(git rev-parse --short HEAD), version $VERSION (last store build: $STORE).
Not run for you. After the simulator pass in .claude/skills/release-verify:
  npx --yes eas-cli@latest build --platform ios --profile production --non-interactive
  npx --yes eas-cli@latest submit --platform ios --profile production --latest --non-interactive   # TestFlight only
Then: record the build in scripts/store-build.json, do the phone pass on TestFlight, leave it a day on internal
TestFlight, check crash reports, and only then submit for review (the owner's call).
OUT
