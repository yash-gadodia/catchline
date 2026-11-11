// swift-tools-version: 5.9
// macOS CLI around the share renderer (symlinked from ../ios, minus the files that need Expo or UIKit): draws the
// 4.0 share video or image from a clip and a TrackSpec JSON, so the output can be looked at off-device.
//   swift build -c release
//   .build/release/track-share video <clip.mp4> --spec spec.json --out share.mp4
//   .build/release/track-share image <clip.mp4> --spec spec.json --out share.jpg
import PackageDescription

let package = Package(
  name: "track-share",
  platforms: [.macOS(.v14)],
  targets: [
    .executableTarget(
      name: "track-share",
      path: "Sources/track-share",
      exclude: ["core/ClipTranscoderModule.swift", "core/ShareRenderer.swift", "core/ClipTranscoder.podspec"]
    ),
  ]
)
