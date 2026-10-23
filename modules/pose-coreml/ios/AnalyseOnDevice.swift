import AVFoundation
import CoreVideo
import Foundation

// The whole clip read on the phone, as cv/catchline_cv/trace.py records it: pose + lifter + camera path
// on the first call, then the pixel stages on exactly the frames the TS pipeline asks for (the plan,
// built from its replay misses), merged into the same trace. Pose runs once per clip. Free of
// ExpoModulesCore: the macOS harness drives this same file.

private let cameraSmallHeight = 360
private let L_WRI = 9, R_WRI = 10

struct AnalysePlan {
  struct Window { let s0: Int; let count: Int }
  struct PlateRequest { let frame: Int; let wristA: Point; let wristB: Point; let bodyH: Double; let setupH: Double? }
  struct TrackRequest { let s0: Int; let n: Int; let start: Int; let plate: Plate }
  struct KeyframeRequest { let name: String; let frame: Int }

  var windows: [Window] = []
  var plates: [PlateRequest] = []
  var tracks: [TrackRequest] = []
  var keyframes: [KeyframeRequest] = []

  init() {}

  init(json: [String: Any]) throws {
    func int(_ d: [String: Any], _ k: String) throws -> Int {
      guard let v = d[k] as? NSNumber else { throw StageError.invalid("plan: \(k) missing") }
      return v.intValue
    }
    func num(_ d: [String: Any], _ k: String) throws -> Double {
      guard let v = d[k] as? NSNumber else { throw StageError.invalid("plan: \(k) missing") }
      return v.doubleValue
    }
    func point(_ v: Any?) -> Point {
      guard let a = v as? [Any], a.count == 2 else { return Point(.nan, .nan) }
      let x = (a[0] as? NSNumber)?.doubleValue ?? .nan, y = (a[1] as? NSNumber)?.doubleValue ?? .nan
      return Point(x, y)
    }
    for w in json["windows"] as? [[String: Any]] ?? [] {
      windows.append(Window(s0: try int(w, "s0"), count: try int(w, "count")))
    }
    for p in json["plates"] as? [[String: Any]] ?? [] {
      plates.append(PlateRequest(frame: try int(p, "frame"), wristA: point(p["wristA"]), wristB: point(p["wristB"]),
                                 bodyH: try num(p, "bodyH"), setupH: (p["setupH"] as? NSNumber)?.doubleValue))
    }
    for t in json["tracks"] as? [[String: Any]] ?? [] {
      guard let pl = t["plate"] as? [String: Any], let axes = pl["axes"] as? [Any], axes.count == 2 else {
        throw StageError.invalid("plan: track plate missing")
      }
      let plate = Plate(centre: point(pl["centre"]), axes: ((axes[0] as? NSNumber)?.doubleValue ?? .nan, (axes[1] as? NSNumber)?.doubleValue ?? .nan),
                        score: try num(pl, "score"), side: pl["side"] as? String ?? "near", fitInliers: nil)
      tracks.append(TrackRequest(s0: try int(t, "s0"), n: try int(t, "n"), start: try int(t, "start"), plate: plate))
    }
    for k in json["keyframes"] as? [[String: Any]] ?? [] {
      guard let name = k["name"] as? String else { throw StageError.invalid("plan: keyframe name missing") }
      keyframes.append(KeyframeRequest(name: name, frame: try int(k, "frame")))
    }
  }
}

// trace.py enc() of track.py's plate dict
func plateDict(_ p: Plate) -> [String: Any] {
  var d: [String: Any] = ["centre": nd([2], [p.centre.x, p.centre.y]), "axes": tup([p.axes.0, p.axes.1]), "score": p.score, "side": p.side]
  if let f = p.fitInliers { d["fit_inliers"] = f }
  return d
}

// 3x3 product of two 2x3 affines (rows [a b tx; c d ty; 0 0 1])
func compose(_ A: Affine, _ B: Affine) -> Affine {
  [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
   A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]]
}

private func nanmedian(_ v: [Double]) -> Double {
  let s = v.filter { $0.isFinite }.sorted()
  if s.isEmpty { return .nan }
  return s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2
}

private func affineND(_ M: Affine) -> [String: Any] { nd([2, 3], M) }

// Sequential decode of the clip's video track as 4:2:0 pixel buffers, one autorelease pool per frame.
struct ClipReader {
  let asset: AVURLAsset
  let track: AVAssetTrack
  let rotation: Int
  let width: Int   // upright
  let height: Int
  let fps: Double

  init(url: URL) async throws {
    asset = AVURLAsset(url: url)
    guard let t = try await asset.loadTracks(withMediaType: .video).first else { throw PoseCoreMLError.noVideoTrack }
    track = t
    let (natural, transform, minDuration) = try await t.load(.naturalSize, .preferredTransform, .minFrameDuration)
    rotation = rotationDegrees(transform)
    let shown = natural.applying(transform)
    width = Int(abs(shown.width).rounded())
    height = Int(abs(shown.height).rounded())
    // ffprobe r_frame_rate: num / den of the frame duration, as a double division
    fps = minDuration.value > 0 ? Double(minDuration.timescale) / Double(minDuration.value) : Double(try await t.load(.nominalFrameRate))
  }

  // pose.py: w = round(W * h / H / 2) * 2
  func width(at h: Int) -> Int { Int((Double(width) * Double(h) / Double(height) / 2).rounded()) * 2 }

  // video.probe's rotation sign (ffprobe's display matrix), (-180, 180]
  var probeRotation: Int { rotation == 0 ? 0 : rotation == 180 ? 180 : rotation == 90 ? -90 : 90 }

  func read(_ body: (Int, CVPixelBuffer) throws -> Void) throws -> Int {
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    output.alwaysCopiesSampleData = false
    reader.add(output)
    guard reader.startReading() else { throw PoseCoreMLError.readFailed(reader.error?.localizedDescription ?? "reader") }
    var i = 0
    var reading = true
    while reading {
      try autoreleasepool {
        guard let sample = output.copyNextSampleBuffer() else { reading = false; return }
        guard let pb = CMSampleBufferGetImageBuffer(sample) else { return }
        try body(i, pb)
        i += 1
      }
    }
    if reader.status == .failed { throw PoseCoreMLError.readFailed(reader.error?.localizedDescription ?? "read") }
    return i
  }
}

// select_lifter seeds on the largest box x mean keypoint score and follows that person by box overlap, so a box far
// shorter than the frame's tallest is in practice never the lifter: only boxes at least this fraction of the tallest
// are posed (the rest stay as boxes, for the camera path's masks). Checked against posing everyone in the PR body.
let lifterSizeFraction: Float = 0.4

func lifterCandidates(_ boxes: [[Float]]) -> [Int] {
  let tallest = boxes.map { $0[3] - $0[1] }.max() ?? 0
  return boxes.indices.filter { boxes[$0][3] - boxes[$0][1] >= lifterSizeFraction * tallest }
}

// What the first pass read, kept so a planned pass needs no second inference
struct PoseRun {
  let url: URL
  let poseKey: String  // str(two_pass): "True" for the kipping HSPU's second pass, else "False"
  let hanging: Bool
  let outW: Int
  let people: [[PosePerson]]
  let lifter: LifterTrack
  let cameraPath: [Affine]
  var calls: [String: [String: [Any]]]  // trace.py Recorder.calls
  var meta: [String: Any]
}

// Seconds per stage of the last pose pass (the harness prints ms per frame)
struct PoseTiming {
  var decode = 0.0, upright = 0.0, detect = 0.0, pose = 0.0, camera = 0.0
  var frames = 0, people = 0, posed = 0
}

final class DeviceAnalyser {
  let models: PoseModels
  var run: PoseRun?  // settable so the harness can reload a cached pose pass
  private(set) var timing = PoseTiming()
  var poseEveryone = false  // harness only: the full pose pass, for parity against lifter-only

  init(models: PoseModels) { self.models = models }

  // cameraPath false (harness only): pose and lifter without track.py camera_path
  func analyse(url: URL, movement: String, plan: AnalysePlan?, stillsDir: URL, cameraPath: Bool = true,
               progress: @escaping (String, Double) -> Void) async throws -> (trace: [String: Any], stills: [String: URL]) {
    let twoPass = movement == "kipping_hspu"
    let hanging = movement == "kipping_pull_up" || movement == "bar_muscle_up"
    let key = twoPass ? "True" : "False"
    if run == nil || run!.url != url || run!.poseKey != key || run!.hanging != hanging {
      run = try await posePass(url: url, poseKey: key, twoPass: twoPass, hanging: hanging, cameraPath: cameraPath, progress: progress)
    }
    var stills: [String: URL] = [:]
    if let plan, !(plan.windows.isEmpty && plan.plates.isEmpty && plan.tracks.isEmpty && plan.keyframes.isEmpty) {
      stills = try await pixelPass(plan: plan, stillsDir: stillsDir, progress: progress)
    }
    return (trace(), stills)
  }

  func trace() -> [String: Any] {
    guard let r = run else { return [:] }
    return ["traceVersion": 1, "analysisVersion": NSNull(), "poseSource": "device", "meta": r.meta,
            "pose": [r.poseKey: ["shape": [poseInferHeight, r.outW, 3], "n": r.people.count] as [String: Any]],
            "scale": NSNull(), "calls": r.calls]
  }

  private func posePass(url: URL, poseKey: String, twoPass: Bool, hanging: Bool, cameraPath: Bool,
                        progress: @escaping (String, Double) -> Void) async throws -> PoseRun {
    let clip = try await ClipReader(url: url)
    let outW = clip.width(at: poseInferHeight)
    let smallW = clip.width(at: cameraSmallHeight)
    let s = Double(cameraSmallHeight) / Double(poseInferHeight)
    let models = self.models
    let duration = try await clip.asset.load(.duration).seconds
    var people: [[PosePerson]] = []
    var path: [Affine] = []
    var acc = identityAffine
    var prevSmall: GrayImage?
    var sent = -1.0
    var tm = PoseTiming()
    var tick = Date()
    func lap() -> Double { let now = Date(); defer { tick = now }; return now.timeIntervalSince(tick) }
    let n = try clip.read { f, pb in
      tm.decode += lap()
      let planes = UprightPlanes(pb, rotation: clip.rotation)
      let img = uprightBGR(planes, outW: outW, outH: poseInferHeight)
      tm.upright += lap()
      var row: [PosePerson] = []
      let boxes = try detectPeople(img, models)
      tm.detect += lap()
      let pick = poseEveryone || twoPass ? Array(boxes.indices) : lifterCandidates(boxes)
      for (i, box) in boxes.enumerated() {
        guard pick.contains(i) else { row.append(.unposed(box: box)); continue }
        // merge_passes compares the 26-point mean with the head scores still in; invertedPass strips them after
        let (k, sc) = try estimatePose(img, box: box, models, stripHead: !twoPass)
        row.append(PosePerson(box: box, kpts: k, scores: sc))
      }
      tm.pose += lap()
      tm.frames += 1
      tm.people += row.count
      tm.posed += pick.count
      if twoPass { row = try invertedPass(img, upright: row, models) }
      // track.py camera_path: KLT on the clip at 360 px tall, the previous frame's people masked
      let small = cameraPath ? grayscale(uprightBGR(planes, outW: smallW, outH: cameraSmallHeight)) : nil
      if let prev = prevSmall, let small {
        let boxes = people[f - 1].map { $0.box.map { Double($0) * s } }
        let mask = try foregroundMask(width: smallW, height: cameraSmallHeight, boxes: boxes, wrists: nil, scale: 0)
        let M = try cameraMotionStep(prev: prev, cur: small, foreground: mask, params: .cameraPath)?.affine ?? identityAffine
        acc = compose(acc, M)
      }
      path.append([acc[0], acc[1], acc[2] / s, acc[3], acc[4], acc[5] / s])
      prevSmall = small
      tm.camera += lap()
      people.append(row)
      let p = duration > 0 ? min(Double(f + 1) / (duration * clip.fps), 1) : 0
      if p - sent >= 0.02 { sent = p; progress("pose", p) }
    }
    progress("pose", 1)
    timing = tm
    let lifter = selectLifter(people, hanging: hanging)
    var k: [Double] = [], ks: [Double] = [], boxes: [Double] = []
    k.reserveCapacity(n * 52)
    for f in 0 ..< n {
      for j in 0 ..< 26 { k.append(lifter.kpts[f][j].x); k.append(lifter.kpts[f][j].y) }
      ks += lifter.scores[f]
      boxes += lifter.boxes[f]
    }
    var calls: [String: [String: [Any]]] = [
      "select_lifter": ["\(poseKey):\(hanging ? "True" : "False")": [tup([nd([n, 26, 2], k), nd([n, 26], ks), nd([n, 4], boxes)])]],
    ]
    if cameraPath { calls["camera_path"] = [poseKey: [path.map(affineND)]] }
    let meta: [String: Any] = ["width": clip.width, "height": clip.height, "fps": clip.fps, "frameCount": n, "rotation": clip.probeRotation]
    return PoseRun(url: url, poseKey: poseKey, hanging: hanging, outW: outW, people: people, lifter: lifter, cameraPath: path, calls: calls, meta: meta)
  }

  // pipeline.py analyse_rep / lifts.load_window on the frames the plan names: per window the
  // stabilise chain (track.py stabilise), per plate frame find_plates + refine_plate, per track
  // track_plate from its seed, plus the keyframe stills at 1080 px.
  private func pixelPass(plan: AnalysePlan, stillsDir: URL, progress: @escaping (String, Double) -> Void) async throws -> [String: URL] {
    guard var r = run else { throw StageError.invalid("pose pass missing") }
    let clip = try await ClipReader(url: r.url)
    let total = r.people.count
    let outW = r.outW
    // read_frame's ffmpeg scale=-2 rounds up to even, unlike video.frames() (clip.width(at:))
    let W1080 = keyframeWidth(displayWidth: Double(clip.width), displayHeight: Double(clip.height))

    final class WindowState {
      let s0: Int, count: Int, n: Int, bodyH: Double
      var toRef: [Affine] = [identityAffine]
      var inliers: [Int] = []
      var prev: GrayImage?
      init(_ w: AnalysePlan.Window, total: Int, boxes: [Box]) {
        s0 = w.s0; count = w.count; n = max(0, min(w.count, total - w.s0))
        bodyH = nanmedian((s0 ..< s0 + n).map { boxes[$0][3] - boxes[$0][1] })
      }
    }
    final class TrackState {
      let req: AnalysePlan.TrackRequest
      var track: PlateTrack
      var centres: [Double]
      var scores: [Double]
      init(_ t: AnalysePlan.TrackRequest) {
        req = t
        track = PlateTrack(seed: t.plate)
        centres = [Double](repeating: .nan, count: t.n * 2)
        scores = [Double](repeating: .nan, count: t.n)
        centres[t.start * 2] = t.plate.centre.x
        centres[t.start * 2 + 1] = t.plate.centre.y
        scores[t.start] = t.plate.score
      }
    }
    let windows = plan.windows.map { WindowState($0, total: total, boxes: r.lifter.boxes) }
    let tracks = plan.tracks.map { TrackState($0) }
    var plateFrames: [Int: AnalysePlan.PlateRequest] = [:]
    for p in plan.plates { plateFrames[p.frame] = p }
    var keyframes: [Int: [String]] = [:]
    for k in plan.keyframes { keyframes[min(max(k.frame, 0), total - 1), default: []].append(k.name) }
    let last = max(windows.map { $0.s0 + $0.n }.max() ?? 0, tracks.map { $0.req.s0 + $0.req.n }.max() ?? 0,
                   (plateFrames.keys.max() ?? -1) + 1, (keyframes.keys.max() ?? -1) + 1)
    try FileManager.default.createDirectory(at: stillsDir, withIntermediateDirectories: true)
    var stills: [String: URL] = [:]
    var sent = -1.0

    _ = try clip.read { f, pb in
      if f >= last { return }
      let p = Double(f + 1) / Double(last)
      if p - sent >= 0.02 { sent = p; progress("pixels", p) }
      var img: BGRImage?
      func image() -> BGRImage {
        if img == nil { img = uprightBGR(pb, rotation: clip.rotation, outW: outW, outH: poseInferHeight) }
        return img!
      }
      for w in windows where f >= w.s0 && f < w.s0 + w.n {
        let cur = grayscale(image())
        if let prev = w.prev {
          let kw = r.lifter.kpts[f - 1]
          let mask = try foregroundMask(width: outW, height: poseInferHeight, boxes: r.people[f - 1].map { $0.box.map { Double($0) } },
                                        wrists: (kw[L_WRI], kw[R_WRI]), scale: 0.12 * w.bodyH)
          var M = identityAffine
          if let step = try cameraMotionStep(prev: prev, cur: cur, foreground: mask, params: .stabilise) {
            M = step.affine
            w.inliers.append(step.inliers)
          }
          w.toRef.append(compose(w.toRef.last!, M))
        }
        w.prev = cur
      }
      if let req = plateFrames[f] {
        let found = try findPlates(image(), wristA: req.wristA, wristB: req.wristB, bodyH: req.bodyH, setupH: req.setupH)
        r.calls["find_plates", default: [:]][String(f), default: []].append(found.map(plateDict))
        for plate in found {
          let refined = try refinePlate(image(), plate)
          r.calls["refine_plate", default: [:]][traceKey(plateDict(plate)), default: []].append(refined.map(plateDict) ?? NSNull())
        }
      }
      for t in tracks where !t.track.lost && f > t.req.s0 + t.req.start && f < t.req.s0 + t.req.n {
        try trackPlateStep(image(), &t.track)
        if t.track.lost { continue }
        let i = f - t.req.s0
        t.centres[i * 2] = t.track.centre.x
        t.centres[i * 2 + 1] = t.track.centre.y
        t.scores[i] = t.track.score
      }
      if let names = keyframes[f] {
        let still = uprightBGR(pb, rotation: clip.rotation, outW: W1080, outH: keyframeHeight)
        let jpeg = try keyframeJPEG(still, blur: [])
        for name in names {
          let dest = stillsDir.appendingPathComponent(name)
          try jpeg.write(to: dest, options: .atomic)
          stills[name] = dest
        }
      }
    }
    for w in windows {
      r.calls["frames", default: [:]]["\(poseInferHeight):\(w.s0):\(w.count)", default: []].append([w.n])
      r.calls["stabilise", default: [:]]["\(w.s0):\(w.n)", default: []].append(tup([w.toRef.map(affineND), w.inliers]))
    }
    for t in tracks {
      r.calls["track_plate", default: [:]]["\(t.req.s0):\(t.req.n):\(t.req.start):None", default: []]
        .append(tup([nd([t.req.n, 2], t.centres), nd([t.req.n], t.scores)]))
    }
    progress("pixels", 1)
    run = r
    return stills
  }
}
