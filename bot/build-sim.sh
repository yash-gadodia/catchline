#!/bin/bash
# Build a Release simulator app of the current checkout (JS bundled, no Metro) and
# install it on the bot's own simulator. Skips the build when this commit is built.
set -euo pipefail
# launchd starts the loop without a locale; CocoaPods then dies with
# "Unicode Normalization not appropriate for ASCII-8BIT".
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

SIM_NAME="Catchline Bot"
BUILT="$HOME/.catchline-bot/built-sha"
SHA=$(git rev-parse HEAD)

# CoreSimulator runtime discovery can wedge (14-10: every simctl call took 18 s all day, "Unable to
# discover any Simulator runtimes" in ~/Library/Logs/CoreSimulator/CoreSimulator.log). A slow simctl
# makes maestro's launchApp (3 simctl calls) time out and the MCP driver die, so fail fast here.
simctl_secs() { local T0=$(date +%s); xcrun simctl list runtimes >/dev/null 2>&1 || true; echo $(( $(date +%s) - T0 )); }
# Never kill CoreSimulatorService or simdiskimaged here: force-killing simdiskimaged
# (a root daemon that mounts the runtime disk images) is what wedged runtime
# discovery for days on 14-16 Oct; only a reboot cleared it. A cold first call can
# be slow, so take the best of three before calling the host unhealthy.
BEST=999
for _ in 1 2 3; do S=$(simctl_secs); [ "$S" -lt "$BEST" ] && BEST=$S; [ "$BEST" -le 5 ] && break; sleep 5; done
if [ "$BEST" -gt 5 ]; then echo "build-sim: simctl ${BEST}s (best of 3), host unhealthy, aborting run (reboot the Mini)"; exit 2; fi

UDID=$(xcrun simctl list devices available | grep "$SIM_NAME (" | head -1 | grep -oE '[0-9A-F-]{36}' || true)
if [ -z "$UDID" ]; then
  RUNTIME=$(xcrun simctl list runtimes available | grep -oE 'com\.apple\.CoreSimulator\.SimRuntime\.iOS-[0-9-]+' | tail -1)
  UDID=$(xcrun simctl create "$SIM_NAME" com.apple.CoreSimulator.SimDeviceType.iPhone-16 "$RUNTIME")
fi
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null

if [ "$(cat "$BUILT" 2>/dev/null)" = "$SHA" ] && xcrun simctl get_app_container "$UDID" com.yashgadodia.parallax >/dev/null 2>&1; then
  echo "build-sim: $SHA already installed on $UDID"
  exit 0
fi

npm install --legacy-peer-deps --no-audit --no-fund
npx expo prebuild -p ios --no-install
(cd ios && pod install)
DD="$HOME/.catchline-bot/DerivedData"
xcodebuild -workspace ios/*.xcworkspace -scheme Catchline -configuration Release \
  -sdk iphonesimulator -destination "id=$UDID" -derivedDataPath "$DD" \
  CODE_SIGNING_ALLOWED=NO build -quiet
APP=$(find "$DD/Build/Products/Release-iphonesimulator" -maxdepth 1 -name '*.app' | head -1)
xcrun simctl install "$UDID" "$APP"
echo "$SHA" > "$BUILT"
echo "build-sim: installed $SHA on $UDID"
