// swift-tools-version: 5.9
// macOS CLI around the module's Swift (symlinked from ../ios, minus the Expo module file): runs the
// on-device pipeline on a video file and writes the trace, so trace-vs-Python parity is checked off-device.
//   swift build -c release && .build/release/catchline-harness pose <clip> --models <dir> --out trace.json.gz
import PackageDescription

let package = Package(
  name: "catchline-harness",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(
      name: "harness",
      path: "Sources/harness",
      exclude: ["core/PoseCoreMLModule.swift", "core/PoseCoreML.podspec"]
    ),
  ]
)
