// swift-tools-version: 5.9
// macOS CLI around the clip transcoder's Swift (symlinked from ../ios, minus the file that needs UIKit): prepares a
// clip the way the phone does before tracking, and draws the 4.0 share video or image, so both can be checked
// off-device. Sources/ExpoModulesCore is a small stand-in so ClipTranscoderModule.swift compiles unchanged.
//   swift build -c release
//   .build/release/track-share probe <clip>
//   .build/release/track-share transcode <clip> --opts '{"startS":0,"endS":8,"width":608,"height":1080,"fps":30,"dropToFps":false,"bitrate":8000000}' --out prepared.mp4
//   .build/release/track-share video <clip.mp4> --spec spec.json --out share.mp4
//   .build/release/track-share image <clip.mp4> --spec spec.json --out share.jpg
import PackageDescription

let package = Package(
  name: "track-share",
  platforms: [.macOS(.v14)],
  targets: [
    .target(name: "ExpoModulesCore", path: "Sources/ExpoModulesCore"),
    .executableTarget(
      name: "track-share",
      dependencies: ["ExpoModulesCore"],
      path: "Sources/track-share",
      exclude: ["core/ShareRenderer.swift", "core/ClipTranscoder.podspec"]
    ),
  ]
)
