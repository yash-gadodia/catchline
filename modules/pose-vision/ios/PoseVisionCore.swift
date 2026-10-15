import AVFoundation
import CoreGraphics
import Foundation
import Vision

// Apple Vision body pose over every frame of a local clip, all on the device.
// Kept free of ExpoModulesCore so a macOS CLI can compile the same file.
//
// Output (pixel coords of the upright video, origin top-left):
//   { fps, width, height, frames: [{ t, joints: { name: [x, y, conf] }, box?, others? }] }
// `joints` is the lifter; `others` are everyone else in that frame (only so the
// server can still blur bystanders in keyframes). Head joints (nose, eyes, ears)
// only grow the person box and are never returned.

enum PoseVisionError: Error {
  case noVideoTrack
  case readFailed(String)
}

struct PoseVisionOptions {
  var fps: Double = 0
  var maxSide: Int = 0
  var minConfidence: Float = 0.1
}

private struct Person {
  var box: CGRect
  var joints: [String: [Double]]
  var score: Double
}

private let bodyJoints: [VNHumanBodyPoseObservation.JointName] = [
  .neck, .leftShoulder, .rightShoulder, .leftElbow, .rightElbow, .leftWrist, .rightWrist,
  .root, .leftHip, .rightHip, .leftKnee, .rightKnee, .leftAnkle, .rightAnkle,
]

func poseVisionOrientation(_ t: CGAffineTransform) -> CGImagePropertyOrientation {
  if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
  if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
  if t.a == -1 && t.d == -1 { return .down }
  return .up
}

private func iou(_ a: CGRect, _ b: CGRect) -> Double {
  let inter = a.intersection(b)
  if inter.isNull { return 0 }
  let i = Double(inter.width * inter.height)
  return i / (Double(a.width * a.height) + Double(b.width * b.height) - i + 1e-9)
}

// Same idea as cv/catchline_cv/lifter.py: seed on the largest confident person,
// then follow that box through the clip by IoU in both directions.
private func trackLifter(_ people: [[Person]]) -> [Int?] {
  var seed: (f: Int, i: Int)?
  var best = -1.0
  for (f, ps) in people.enumerated() {
    for (i, p) in ps.enumerated() {
      let s = Double(p.box.height) * p.score
      if s > best { best = s; seed = (f, i) }
    }
  }
  var pick = [Int?](repeating: nil, count: people.count)
  guard let seed else { return pick }
  pick[seed.f] = seed.i
  for range in [Array(seed.f + 1 ..< people.count), Array((0 ..< seed.f).reversed())] {
    var prev = people[seed.f][seed.i].box
    for f in range {
      let cands = people[f].enumerated().map { ($0.offset, iou(prev, $0.element.box)) }
      guard let top = cands.max(by: { $0.1 < $1.1 }), top.1 >= 0.3 else { continue }
      pick[f] = top.0
      prev = people[f][top.0].box
    }
  }
  return pick
}

private func boxArray(_ r: CGRect) -> [Double] {
  [r.minX.rounded(), r.minY.rounded(), r.maxX.rounded(), r.maxY.rounded()]
}

func analyzePoseVision(url: URL, options: PoseVisionOptions, progress: (Double) -> Void) async throws -> [String: Any] {
  let asset = AVURLAsset(url: url)
  guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw PoseVisionError.noVideoTrack }
  let (natural, transform, nominalFps) = try await track.load(.naturalSize, .preferredTransform, .nominalFrameRate)
  let duration = try await asset.load(.duration).seconds
  let shown = natural.applying(transform)
  let width = abs(shown.width), height = abs(shown.height)
  let orientation = poseVisionOrientation(transform)

  var settings: [String: Any] = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
  let longSide = max(natural.width, natural.height)
  if options.maxSide > 0 && longSide > CGFloat(options.maxSide) {
    let s = CGFloat(options.maxSide) / longSide
    settings[kCVPixelBufferWidthKey as String] = Int((natural.width * s / 2).rounded()) * 2
    settings[kCVPixelBufferHeightKey as String] = Int((natural.height * s / 2).rounded()) * 2
  }
  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { throw PoseVisionError.readFailed(reader.error?.localizedDescription ?? "reader") }

  let request = VNDetectHumanBodyPoseRequest()
  let minGap = options.fps > 0 ? 0.9 / options.fps : 0
  var times: [Double] = []
  var people: [[Person]] = []
  var first: Double?
  var sent = -1.0

  while let buffer = output.copyNextSampleBuffer() {
    guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { continue }
    let pts = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
    let t = pts - (first ?? pts)
    if first == nil { first = pts }
    if let last = times.last, t - last < minGap { continue }

    try VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientation, options: [:]).perform([request])
    var row: [Person] = []
    for obs in request.results ?? [] {
      guard let points = try? obs.recognizedPoints(.all) else { continue }
      var minX = CGFloat.infinity, minY = CGFloat.infinity, maxX = -CGFloat.infinity, maxY = -CGFloat.infinity
      for p in points.values where p.confidence >= options.minConfidence {
        let x = p.location.x * width, y = (1 - p.location.y) * height
        minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
      }
      var joints: [String: [Double]] = [:]
      var total = 0.0
      for name in bodyJoints {
        guard let p = points[name], p.confidence >= options.minConfidence else { continue }
        joints[name.rawValue.rawValue] = [
          (p.location.x * width).rounded(), ((1 - p.location.y) * height).rounded(), (Double(p.confidence) * 100).rounded() / 100,
        ]
        total += Double(p.confidence)
      }
      if joints.count < 4 || !minX.isFinite { continue }
      row.append(Person(box: CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY), joints: joints,
                        score: total / Double(bodyJoints.count)))
    }
    times.append(t)
    people.append(row)

    let p = duration > 0 ? min(max(t / duration, 0), 1) : 0
    if p - sent >= 0.02 {
      sent = p
      progress(p)
    }
  }
  if reader.status == .failed { throw PoseVisionError.readFailed(reader.error?.localizedDescription ?? "read") }

  let lifter = trackLifter(people)
  var frames: [[String: Any]] = []
  for (f, row) in people.enumerated() {
    var frame: [String: Any] = ["t": (times[f] * 10000).rounded() / 10000]
    if let i = lifter[f] {
      frame["joints"] = row[i].joints
      frame["box"] = boxArray(row[i].box)
    } else {
      frame["joints"] = [String: [Double]]()
    }
    let others = row.enumerated().filter { $0.offset != lifter[f] }.map { ["box": boxArray($0.element.box), "joints": $0.element.joints] as [String: Any] }
    if !others.isEmpty { frame["others"] = others }
    frames.append(frame)
  }
  progress(1)
  return ["fps": Double(nominalFps), "width": Double(width), "height": Double(height), "frames": frames]
}
