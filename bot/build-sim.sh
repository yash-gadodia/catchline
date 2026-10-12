#!/bin/bash
# Build a Release simulator app of the current checkout (JS bundled, no Metro) and
# install it on the bot's own simulator. Skips the build when this commit is built.
set -euo pipefail

SIM_NAME="Catchline Bot"
BUILT="$HOME/.catchline-bot/built-sha"
SHA=$(git rev-parse HEAD)

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
