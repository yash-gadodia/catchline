import AVFoundation
import Foundation

// macOS harness for Stages/CameraMotion.swift: prints track.py's camera_path (and, given a
// job file, each window's stabilise) for a clip, from the same frames the phone decodes.
//
//   camera-path <clip> [--job job.json] [--backend klt|vision-translation|vision-homography]
//               [--out result.json] [--dump-gray dir]
//
// job.json (cv/scripts/camera_parity.py job): people boxes per frame in inference px and the
// stabilise windows with the lifter's wrists. Without it only the whole-clip path is printed,
// with no people masked. Build: see cv/scripts/camera_parity.py.

struct Window {
  let s0: Int, n: Int, scale: Double, wristBand: Bool
  let wrists: [[Double]]  // per frame lx ly rx ry
}

func readJob(_ path: String) throws -> (people: [[Box]], windows: [Window], inferH: Int, smallH: Int) {
  let obj = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: Any]
  let people = (obj["people"] as! [[[Double]]])
  let windows = (obj["windows"] as? [[String: Any]] ?? []).map {
    Window(s0: $0["s0"] as! Int, n: $0["n"] as! Int, scale: $0["scale"] as! Double, wristBand: $0["wristBand"] as! Bool,
           wrists: ($0["wrists"] as! [[Double]]).map { $0.map { $0 > 1e29 ? .nan : $0 } })  // JSON has no NaN
  }
  return (people, windows, obj["inferH"] as? Int ?? poseInferHeight, obj["smallH"] as? Int ?? 360)
}

func decode(_ url: URL, smallH: Int, inferH: Int, wanted: Set<Int>) async throws -> (small: [GrayImage], full: [Int: GrayImage], seconds: Double) {
  let asset = AVURLAsset(url: url)
  guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw PoseCoreMLError.noVideoTrack }
  let (natural, transform) = try await track.load(.naturalSize, .preferredTransform)
  let rotation = rotationDegrees(transform)
  let shown = natural.applying(transform)
  let (dispW, dispH) = (abs(shown.width), abs(shown.height))
  let smallW = Int((Double(dispW) * Double(smallH) / Double(dispH) / 2).rounded()) * 2
  let fullW = Int((Double(dispW) * Double(inferH) / Double(dispH) / 2).rounded()) * 2
  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  ])
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { throw PoseCoreMLError.readFailed(reader.error?.localizedDescription ?? "reader") }
  var small: [GrayImage] = [], full: [Int: GrayImage] = [:]
  let t0 = Date()
  var i = 0, reading = true
  while reading {
    autoreleasepool {
      guard let sample = output.copyNextSampleBuffer() else { reading = false; return }
      guard let pb = CMSampleBufferGetImageBuffer(sample) else { return }
      small.append(grayscale(uprightBGR(pb, rotation: rotation, outW: smallW, outH: smallH)))
      if wanted.contains(i) { full[i] = grayscale(uprightBGR(pb, rotation: rotation, outW: fullW, outH: inferH)) }
      i += 1
    }
  }
  return (small, full, Date().timeIntervalSince(t0))
}

func chain(_ steps: [Affine?]) -> [Affine] {
  var out = [identityAffine]
  for M in steps { out.append(mulAffine(out[out.count - 1], M ?? identityAffine)) }
  return out
}

var args = Array(CommandLine.arguments.dropFirst())
func opt(_ name: String) -> String? {
  guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
  let v = args[i + 1]
  args.removeSubrange(i ... i + 1)
  return v
}
let jobPath = opt("--job"), backend = opt("--backend") ?? "klt", outPath = opt("--out"), dumpDir = opt("--dump-gray")
let profile = args.contains("--profile")
args.removeAll { $0 == "--profile" }
guard let clip = args.first else {
  FileHandle.standardError.write("usage: camera-path <clip> [--job job.json] [--backend klt|vision-translation|vision-homography] [--out result.json] [--dump-gray dir]\n".data(using: .utf8)!)
  exit(2)
}

let sem = DispatchSemaphore(value: 0)
var result: [String: Any] = [:]
Task {
  do {
    let job = try jobPath.map(readJob)
    let inferH = job?.inferH ?? poseInferHeight, smallH = job?.smallH ?? 360
    var wanted = Set<Int>()
    for w in job?.windows ?? [] { for f in w.s0 ..< w.s0 + w.n { wanted.insert(f) } }
    let (small, full, decodeS) = try await decode(URL(fileURLWithPath: clip), smallH: smallH, inferH: inferH, wanted: wanted)
    if let dir = dumpDir {
      try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
      var raw = Data()
      for g in small { raw.append(contentsOf: g.data) }
      try raw.write(to: URL(fileURLWithPath: dir).appendingPathComponent("small.gray"))
      var rawFull = Data()
      for f in full.keys.sorted() { rawFull.append(contentsOf: full[f]!.data) }
      try rawFull.write(to: URL(fileURLWithPath: dir).appendingPathComponent("full.gray"))
      let dims: [String: Any] = ["small": [small[0].width, small[0].height, small.count],
                                 "full": [full.values.first?.width ?? 0, inferH, full.keys.sorted()]]
      try JSONSerialization.data(withJSONObject: dims).write(to: URL(fileURLWithPath: dir).appendingPathComponent("dims.json"))
    }

    // camera_path: people boxes scaled to the small frame, one step per pair
    let s = Double(smallH) / Double(inferH)
    let people = job?.people ?? []
    if profile {
      print("profile: \(small.count) small frames, \(full.count) full frames, windows \((job?.windows ?? []).map { "\($0.s0):\($0.n)" })")
      func ms(_ n: Int, _ body: () throws -> Void) rethrows -> Double {
        let t = Date()
        for _ in 0 ..< n { try body() }
        return Date().timeIntervalSince(t) * 1000 / Double(n)
      }
      var cases: [(String, GrayImage, GrayImage, KLTParams)] = [("camera_path 360", small[1], small[2], .cameraPath)]
      if let f = full.keys.sorted().first, let nxt = full[f + 1] { cases.append(("stabilise \(inferH)", full[f]!, nxt, .stabilise)) }
      for (label, prev, cur, params) in cases {
        let fg = Mask(width: prev.width, height: prev.height, data: [UInt8](repeating: 0, count: prev.width * prev.height))
        let p0 = goodFeaturesToTrack(prev, maxCorners: params.maxCorners, qualityLevel: 0.01, minDistance: params.minDistance, mask: nil)
        let (p1, st) = opticalFlowPyrLK(prev, cur, p0, winSize: params.winSize, maxLevel: params.maxLevel)
        var a = [(Float, Float)](), b = [(Float, Float)]()
        for i in 0 ..< p0.count where st[i] { a.append(p1[i]); b.append(p0[i]) }
        print(label, "\(prev.width)x\(prev.height)", "corners \(p0.count) tracked \(a.count)",
              "gftt \(ms(3) { _ = goodFeaturesToTrack(prev, maxCorners: params.maxCorners, qualityLevel: 0.01, minDistance: params.minDistance, mask: nil) }) ms",
              "lk \(ms(3) { _ = opticalFlowPyrLK(prev, cur, p0, winSize: params.winSize, maxLevel: params.maxLevel) }) ms",
              "ransac \(ms(3) { _ = estimateAffinePartial2D(from: a, to: b, threshold: params.ransacThreshold) }) ms",
              "step \(try ms(3) { _ = try cameraMotionStep(prev: prev, cur: cur, foreground: fg, params: params) }) ms")
      }
      exit(0)
    }
    let t1 = Date()
    var steps: [Affine?] = []
    for f in 1 ..< small.count {
      let boxes = f - 1 < people.count ? people[f - 1].map { $0.map { $0 * s } } : []
      let fg = try foregroundMask(width: small[0].width, height: small[0].height, boxes: boxes, wrists: nil, scale: 0)
      steps.append(try motionStep(backend, prev: small[f - 1], cur: small[f], foreground: fg, params: .cameraPath)?.affine)
    }
    let pathMs = Date().timeIntervalSince(t1) * 1000 / Double(max(small.count - 1, 1))
    let path = chain(steps).map { [$0[0], $0[1], $0[2] / s, $0[3], $0[4], $0[5] / s] }

    // stabilise per window, on the full-height frames
    var stab: [String: Any] = [:]
    var stabFrames = 0
    let t2 = Date()
    for w in job?.windows ?? [] {
      var ms: [Affine?] = [], inl: [Int] = []
      for i in 1 ..< w.n {
        guard let prev = full[w.s0 + i - 1], let cur = full[w.s0 + i] else { break }
        let wr = w.wrists[i - 1]
        let wrists: (Point, Point)? = w.wristBand ? (Point(wr[0], wr[1]), Point(wr[2], wr[3])) : nil
        let fg = try foregroundMask(width: prev.width, height: prev.height, boxes: people[w.s0 + i - 1], wrists: wrists, scale: w.scale)
        let r = try motionStep(backend, prev: prev, cur: cur, foreground: fg, params: .stabilise)
        ms.append(r?.affine)
        if let r = r { inl.append(r.inliers) }
        stabFrames += 1
      }
      stab["\(w.s0):\(w.n)"] = ["Ms": chain(ms), "inliers": inl]
    }
    let stabMs = Date().timeIntervalSince(t2) * 1000 / Double(max(stabFrames, 1))

    result = ["backend": backend, "frames": small.count, "cameraPath": path, "stabilise": stab,
              "timing": ["decode_s": decodeS, "path_ms_per_frame": pathMs, "stabilise_ms_per_frame": stabMs,
                         "stabilise_frames": stabFrames, "small": [small[0].width, smallH]]]
  } catch {
    FileHandle.standardError.write("camera-path: \(error)\n".data(using: .utf8)!)
    exit(1)
  }
  sem.signal()
}
sem.wait()
let data = try! JSONSerialization.data(withJSONObject: result)
if let outPath = outPath { try! data.write(to: URL(fileURLWithPath: outPath)) } else { print(String(data: data, encoding: .utf8)!) }
