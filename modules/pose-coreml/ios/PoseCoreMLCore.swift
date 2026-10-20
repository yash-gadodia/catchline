import Accelerate
import AVFoundation
import CoreML
import Foundation

// cv/catchline_cv/pose.py run_pose, on the phone: the same rtmlib "balanced" models
// (YOLOX-m humanart person detector + RTMPose-m body7 halpe26) converted to Core ML,
// with rtmlib's pre- and post-processing reproduced step by step. Kept free of
// ExpoModulesCore so a macOS CLI compiles this same file for the parity runs.
//
// Every frame is brought to what pose.py sees: upright, INFER_H (1280) px tall,
// BGR. Output per frame: every person as (box, 26 keypoints, 26 scores) in those
// pixels, head points (nose, eyes, ears, head top) dropped, plus the index of the
// lifter tracked like cv/catchline_cv/lifter.py.

// Thrown to JS as "<code>: <detail>" (AnalyseFailedException): no_video_track, clip_unreadable, models_unavailable
enum PoseCoreMLError: Error, CustomStringConvertible {
  case noVideoTrack
  case readFailed(String)
  case model(String)

  var description: String {
    switch self {
    case .noVideoTrack: return "no_video_track: the file has no video track"
    case .readFailed(let s): return "clip_unreadable: \(s)"
    case .model(let s): return "models_unavailable: \(s)"
    }
  }
}

let poseInferHeight = 1280
private let detSize = 640
private let poseW = 192, poseH = 256
private let headIdx: Set<Int> = [0, 1, 2, 3, 4, 17]
private let poseMean: [Float] = [123.675, 116.28, 103.53]
private let poseStd: [Float] = [58.395, 57.12, 57.375]

struct PosePerson {
  var box: [Float]       // x1 y1 x2 y2
  var kpts: [Float]      // 26 * (x, y)
  var scores: [Float]    // 26
}

// An 8-bit BGR image, row-major, no padding.
struct BGRImage {
  let width: Int
  let height: Int
  var data: [UInt8]
}

// Seconds inside detectPeople / estimatePose, split into the Swift pre/post-processing and the Core ML call
struct CoreTiming {
  var detectPre = 0.0, detectInfer = 0.0, detectPost = 0.0, posePre = 0.0, poseInfer = 0.0, posePost = 0.0
}

nonisolated(unsafe) var coreTiming = CoreTiming()

final class PoseModels {
  let det: MLModel
  let pose: MLModel

  init(directory: URL, units: MLComputeUnits = .all) throws {
    let cfg = MLModelConfiguration()
    cfg.computeUnits = units
    func load(_ name: String) throws -> MLModel {
      let compiled = directory.appendingPathComponent("\(name).mlmodelc")
      if FileManager.default.fileExists(atPath: compiled.path) { return try MLModel(contentsOf: compiled, configuration: cfg) }
      let pkg = directory.appendingPathComponent("\(name).mlpackage")
      return try MLModel(contentsOf: try MLModel.compileModel(at: pkg), configuration: cfg)
    }
    det = try load("YoloxHuman")
    pose = try load("RTMPoseHalpe26")
  }
}

// cv2.resize(INTER_LINEAR) for uint8 BGR: half-pixel centres, edge clamp, round to nearest.
func resizeLinear(_ src: BGRImage, _ w: Int, _ h: Int) -> BGRImage {
  var out = [UInt8](repeating: 0, count: w * h * 3)
  let sx = Float(src.width) / Float(w), sy = Float(src.height) / Float(h)
  src.data.withUnsafeBufferPointer { s in
    for y in 0 ..< h {
      var fy = (Float(y) + 0.5) * sy - 0.5
      if fy < 0 { fy = 0 }
      var y0 = Int(fy)
      if y0 >= src.height - 1 { y0 = src.height - 1; fy = Float(y0) }
      let y1 = min(y0 + 1, src.height - 1)
      let wy = fy - Float(y0)
      for x in 0 ..< w {
        var fx = (Float(x) + 0.5) * sx - 0.5
        if fx < 0 { fx = 0 }
        var x0 = Int(fx)
        if x0 >= src.width - 1 { x0 = src.width - 1; fx = Float(x0) }
        let x1 = min(x0 + 1, src.width - 1)
        let wx = fx - Float(x0)
        for c in 0 ..< 3 {
          let a = Float(s[(y0 * src.width + x0) * 3 + c]), b = Float(s[(y0 * src.width + x1) * 3 + c])
          let d = Float(s[(y1 * src.width + x0) * 3 + c]), e = Float(s[(y1 * src.width + x1) * 3 + c])
          let v = (a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy
          out[(y * w + x) * 3 + c] = UInt8(min(max(v.rounded(), 0), 255))
        }
      }
    }
  }
  return BGRImage(width: w, height: h, data: out)
}

// MLShapedArray(converting:) copies element by element; a contiguous float32 output is read straight
private func floats(_ m: MLMultiArray) -> [Float] {
  let n = m.count
  if m.dataType == .float32, n == 0 || (m.strides.last?.intValue ?? 1) == 1 {
    var contiguous = true
    var expect = 1
    for i in stride(from: m.shape.count - 1, through: 0, by: -1) {
      if m.strides[i].intValue != expect { contiguous = false; break }
      expect *= m.shape[i].intValue
    }
    if contiguous {
      return m.withUnsafeBufferPointer(ofType: Float.self) { Array($0) }
    }
  }
  return MLShapedArray<Float>(converting: m).scalars
}

private func iouXYXY(_ a: [Float], _ b: [Float]) -> Float {
  let iw = max(0, min(a[2], b[2]) - max(a[0], b[0])), ih = max(0, min(a[3], b[3]) - max(a[1], b[1]))
  let inter = iw * ih
  let u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
  return u > 0 ? inter / u : 0
}

// YOLOX: rtmlib letterbox (top-left, pad 114, raw BGR values), then the NMS the
// ONNX graph carried (top 5000, IoU 0.65, score > 0.01, at most 200, best 100),
// then rtmlib's score > 0.3. Boxes in `img` pixels.
func detectPeople(_ img: BGRImage, _ models: PoseModels) throws -> [[Float]] {
  var tick = Date()
  func lap() -> Double { let now = Date(); defer { tick = now }; return now.timeIntervalSince(tick) }
  let ratio = min(Float(detSize) / Float(img.height), Float(detSize) / Float(img.width))
  let rw = Int(Float(img.width) * ratio), rh = Int(Float(img.height) * ratio)
  let small = resizeLinear(img, rw, rh)
  let input = try MLMultiArray(shape: [1, 3, NSNumber(value: detSize), NSNumber(value: detSize)], dataType: .float32)
  let plane = detSize * detSize
  let p = input.dataPointer.bindMemory(to: Float.self, capacity: 3 * plane)
  for i in 0 ..< 3 * plane { p[i] = 114 }
  small.data.withUnsafeBufferPointer { s in
    for y in 0 ..< rh {
      for x in 0 ..< rw {
        let o = (y * rw + x) * 3
        for c in 0 ..< 3 { p[c * plane + y * detSize + x] = Float(s[o + c]) }
      }
    }
  }
  coreTiming.detectPre += lap()
  let out = try models.det.prediction(from: MLDictionaryFeatureProvider(dictionary: ["input": input]))
  coreTiming.detectInfer += lap()
  guard let bm = out.featureValue(for: "boxes")?.multiArrayValue, let sm = out.featureValue(for: "scores")?.multiArrayValue else {
    throw PoseCoreMLError.model("detector outputs")
  }
  defer { coreTiming.detectPost += lap() }
  let boxes = floats(bm), scores = floats(sm)
  let n = boxes.count / 4, classes = scores.count / n
  let box = { (i: Int) in Array(boxes[i * 4 ..< i * 4 + 4]) }
  func iou(_ a: Int, _ b: Int) -> Float {
    let iw = max(0, min(boxes[a * 4 + 2], boxes[b * 4 + 2]) - max(boxes[a * 4], boxes[b * 4]))
    let ih = max(0, min(boxes[a * 4 + 3], boxes[b * 4 + 3]) - max(boxes[a * 4 + 1], boxes[b * 4 + 1]))
    let inter = iw * ih
    let u = (boxes[a * 4 + 2] - boxes[a * 4]) * (boxes[a * 4 + 3] - boxes[a * 4 + 1]) + (boxes[b * 4 + 2] - boxes[b * 4]) * (boxes[b * 4 + 3] - boxes[b * 4 + 1]) - inter
    return u > 0 ? inter / u : 0
  }
  // the graph keeps the 5000 anchors with the best class score, then runs NMS per
  // class (IoU 0.65, score > 0.01, 200 per class) and returns the best 100 of all.
  // Only scores > 0.3 survive rtmlib, and a lower box never suppresses a higher one,
  // so per class only the > 0.3 candidates need the NMS: same result, far less work.
  var best = [Float](repeating: 0, count: n)
  for a in 0 ..< n {
    var m = -Float.infinity
    for c in 0 ..< classes where scores[a * classes + c] > m { m = scores[a * classes + c] }
    best[a] = m
  }
  let top = n > 5000 ? Array(Array(0 ..< n).sorted { best[$0] > best[$1] }[..<5000]) : Array(0 ..< n)
  var dets: [(score: Float, a: Int)] = []
  for c in 0 ..< classes {
    let cand = top.filter { scores[$0 * classes + c] > 0.3 }.sorted { scores[$0 * classes + c] > scores[$1 * classes + c] }
    var kept: [Int] = []
    for a in cand {
      if kept.contains(where: { iou($0, a) > 0.65 }) { continue }
      kept.append(a)
      if kept.count == 200 { break }
    }
    dets += kept.map { (scores[$0 * classes + c], $0) }
  }
  dets.sort { $0.score > $1.score }
  return dets.prefix(100).map { d in box(d.a).map { $0 / ratio } }
}

// RTMPose: bbox_xyxy2cs(padding 1.25), aspect fixed to 192:256, cv2.warpAffine
// (INTER_LINEAR, border 0) into 192x256, (BGR - mean) / std, SimCC argmax / 2.
func estimatePose(_ img: BGRImage, box: [Float], _ models: PoseModels) throws -> (kpts: [Float], scores: [Float]) {
  var tick = Date()
  func lap() -> Double { let now = Date(); defer { tick = now }; return now.timeIntervalSince(tick) }
  let cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2
  var sw = (box[2] - box[0]) * 1.25, sh = (box[3] - box[1]) * 1.25
  let aspect = Float(poseW) / Float(poseH)
  if sw > sh * aspect { sh = sw / aspect } else { sw = sh * aspect }
  let s = Float(poseW) / sw
  let tx = Float(poseW) / 2 - s * cx, ty = Float(poseH) / 2 - s * cy

  let input = try MLMultiArray(shape: [1, 3, NSNumber(value: poseH), NSNumber(value: poseW)], dataType: .float32)
  let plane = poseW * poseH
  let p = input.dataPointer.bindMemory(to: Float.self, capacity: 3 * plane)
  img.data.withUnsafeBufferPointer { src in
    for y in 0 ..< poseH {
      let fy = (Float(y) - ty) / s
      let y0 = Int(fy.rounded(.down)), wy = fy - Float(y0)
      for x in 0 ..< poseW {
        let fx = (Float(x) - tx) / s
        let x0 = Int(fx.rounded(.down)), wx = fx - Float(x0)
        for c in 0 ..< 3 {
          func px(_ xx: Int, _ yy: Int) -> Float {
            xx < 0 || yy < 0 || xx >= img.width || yy >= img.height ? 0 : Float(src[(yy * img.width + xx) * 3 + c])
          }
          let v = (px(x0, y0) * (1 - wx) + px(x0 + 1, y0) * wx) * (1 - wy) + (px(x0, y0 + 1) * (1 - wx) + px(x0 + 1, y0 + 1) * wx) * wy
          p[c * plane + y * poseW + x] = (min(max(v.rounded(), 0), 255) - poseMean[c]) / poseStd[c]
        }
      }
    }
  }
  coreTiming.posePre += lap()
  let out = try models.pose.prediction(from: MLDictionaryFeatureProvider(dictionary: ["input": input]))
  coreTiming.poseInfer += lap()
  guard let xm = out.featureValue(for: "simcc_x")?.multiArrayValue, let ym = out.featureValue(for: "simcc_y")?.multiArrayValue else {
    throw PoseCoreMLError.model("pose outputs")
  }
  defer { coreTiming.posePost += lap() }
  let sx = floats(xm), sy = floats(ym)
  let wx = sx.count / 26, wy = sy.count / 26
  var kpts = [Float](repeating: 0, count: 52), scores = [Float](repeating: 0, count: 26)
  for j in 0 ..< 26 {
    var bx = 0, by = 0
    var mx = -Float.infinity, my = -Float.infinity
    for i in 0 ..< wx where sx[j * wx + i] > mx { mx = sx[j * wx + i]; bx = i }
    for i in 0 ..< wy where sy[j * wy + i] > my { my = sy[j * wy + i]; by = i }
    let v = 0.5 * (mx + my)
    let lx: Float = v <= 0 ? -1 : Float(bx), ly: Float = v <= 0 ? -1 : Float(by)
    kpts[j * 2] = lx / 2 / Float(poseW) * sw + cx - sw / 2
    kpts[j * 2 + 1] = ly / 2 / Float(poseH) * sh + cy - sh / 2
    scores[j] = v
  }
  for j in headIdx { kpts[j * 2] = .nan; kpts[j * 2 + 1] = .nan; scores[j] = 0 }
  return (kpts, scores)
}

private func iouBox(_ a: [Float], _ b: [Float]) -> Float {
  let iw = max(0, min(a[2], b[2]) - max(a[0], b[0])), ih = max(0, min(a[3], b[3]) - max(a[1], b[1]))
  let inter = iw * ih
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9)
}

// cv/catchline_cv/lifter.py select_lifter: seed on the largest box x mean score,
// follow it by box IoU >= 0.3 forwards and backwards.
func trackLifter(_ people: [[PosePerson]]) -> [Int?] {
  var seed: (Int, Int)?
  var best: Float = -1
  for (f, ps) in people.enumerated() {
    for (i, p) in ps.enumerated() {
      let score = (p.box[3] - p.box[1]) * p.scores.reduce(0, +) / 26
      if score > best { best = score; seed = (f, i) }
    }
  }
  var pick = [Int?](repeating: nil, count: people.count)
  guard let (sf, si) = seed else { return pick }
  pick[sf] = si
  for range in [Array(sf + 1 ..< people.count), Array((0 ..< sf).reversed())] {
    var prev = people[sf][si].box
    for f in range {
      guard let top = people[f].indices.max(by: { iouBox(prev, people[f][$0].box) < iouBox(prev, people[f][$1].box) }),
            iouBox(prev, people[f][top].box) >= 0.3 else { continue }
      pick[f] = top
      prev = people[f][top].box
    }
  }
  return pick
}

// Separable bicubic resampling table (Keys kernel, a = -0.6: swscale's default
// bicubic, B = 0, C = 0.6), pixel centres aligned, edges clamped, weights normalised.
// swscale's bicubic (B 0, C 0.6): when downscaling the kernel is stretched by the ratio
// and the taps grow to 1 + ceil(4 * ratio), so a 5x downscale is anti-aliased like ffmpeg's
// (a fixed 4-tap kernel left 360 px frames ~50% sharper than ffmpeg's and the camera path drifted).
struct Resampler {
  let n: Int
  let taps: Int
  let idx: [Int]
  let w: [Float]

  init(src: Int, dst: Int, a: Float = -0.6) {
    func k(_ x: Float) -> Float {
      let x = abs(x)
      if x <= 1 { return (a + 2) * x * x * x - (a + 3) * x * x + 1 }
      if x < 2 { return a * x * x * x - 5 * a * x * x + 8 * a * x - 4 * a }
      return 0
    }
    let ratio = Float(src) / Float(dst)
    let taps = src > dst ? max(min(1 + (4 * src + dst - 1) / dst, src - 2), 1) : 4
    let stretch = src > dst ? ratio : 1
    var idx = [Int](repeating: 0, count: dst * taps), w = [Float](repeating: 0, count: dst * taps)
    for d in 0 ..< dst {
      let pos = (Float(d) + 0.5) * ratio - 0.5
      let start = Int(pos - Float(taps - 2) / 2)  // C division: toward zero
      var sum: Float = 0
      for t in 0 ..< taps {
        idx[d * taps + t] = min(max(start + t, 0), src - 1)
        w[d * taps + t] = k((pos - Float(start + t)) / stretch)
        sum += w[d * taps + t]
      }
      for t in 0 ..< taps { w[d * taps + t] /= sum }
    }
    n = dst
    self.taps = taps
    self.idx = idx
    self.w = w
  }
}

// plane (h x w) -> (rh.n x rw.n): rows first (contiguous, vDSP), then columns on the fewer rows
func resample(_ p: [Float], w: Int, h: Int, _ rw: Resampler, _ rh: Resampler) -> [Float] {
  var tmp = [Float](repeating: 0, count: rh.n * w)
  let tw = rw.taps, th = rh.taps
  p.withUnsafeBufferPointer { src in
    tmp.withUnsafeMutableBufferPointer { dst in
      for y in 0 ..< rh.n {
        let o = dst.baseAddress! + y * w
        for t in 0 ..< th {
          var wy = rh.w[y * th + t]
          vDSP_vsma(src.baseAddress! + rh.idx[y * th + t] * w, 1, &wy, o, 1, o, 1, vDSP_Length(w))
        }
      }
    }
  }
  var out = [Float](repeating: 0, count: rh.n * rw.n)
  tmp.withUnsafeBufferPointer { src in
    out.withUnsafeMutableBufferPointer { dst in
      rw.idx.withUnsafeBufferPointer { idx in
        rw.w.withUnsafeBufferPointer { wts in
          for y in 0 ..< rh.n {
            let row = src.baseAddress! + y * w, o = dst.baseAddress! + y * rw.n
            for x in 0 ..< rw.n {
              var v: Float = 0
              for t in 0 ..< tw { v += row[idx[x * tw + t]] * wts[x * tw + t] }
              o[x] = v
            }
          }
        }
      }
    }
  }
  return out
}

// Rotate a plane of `T` clockwise by quarter turns (exact, no resampling).
func rotatePlane<T>(_ p: [T], w: Int, h: Int, quarter: Int) -> (data: [T], w: Int, h: Int) {
  if quarter % 4 == 0 { return (p, w, h) }
  let (ow, oh) = quarter % 2 == 1 ? (h, w) : (w, h)
  var out = p
  for y in 0 ..< h {
    for x in 0 ..< w {
      let (nx, ny): (Int, Int)
      switch quarter % 4 {
      case 1: (nx, ny) = (h - 1 - y, x)
      case 2: (nx, ny) = (w - 1 - x, h - 1 - y)
      default: (nx, ny) = (y, w - 1 - x)
      }
      out[ny * ow + nx] = p[y * w + x]
    }
  }
  return (out, ow, oh)
}

// ffmpeg's YUV -> bgr24 sits this much below an exact BT.709 limited-range
// conversion (B, G, R; measured against ffmpeg 8.1 on three clips, slope 1.000).
private let ffmpegOffset: [Float] = [2.1, 1.85, 2.2]

// The upright frame at outW x outH, BGR, as pose.py's `ffmpeg -vf scale -pix_fmt bgr24`
// pipe produces it: the decoded 4:2:0 planes (bit-exact H.264 output) rotated
// losslessly, luma and chroma scaled bicubically in YUV, chroma shared by pixel
// pairs, then BT.709 limited range to BGR.
func uprightBGR(_ pb: CVPixelBuffer, rotation: Int, outW: Int, outH: Int) -> BGRImage {
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
  let w = CVPixelBufferGetWidthOfPlane(pb, 0), h = CVPixelBufferGetHeightOfPlane(pb, 0)
  let cw = CVPixelBufferGetWidthOfPlane(pb, 1), ch = CVPixelBufferGetHeightOfPlane(pb, 1)
  let yRow = CVPixelBufferGetBytesPerRowOfPlane(pb, 0), cRow = CVPixelBufferGetBytesPerRowOfPlane(pb, 1)
  let yPtr = CVPixelBufferGetBaseAddressOfPlane(pb, 0)!.assumingMemoryBound(to: UInt8.self)
  let cPtr = CVPixelBufferGetBaseAddressOfPlane(pb, 1)!.assumingMemoryBound(to: UInt8.self)
  var Y = [Float](repeating: 0, count: w * h), U = [Float](repeating: 0, count: cw * ch), V = U
  for y in 0 ..< h { for x in 0 ..< w { Y[y * w + x] = Float(yPtr[y * yRow + x]) } }
  for y in 0 ..< ch {
    for x in 0 ..< cw {
      U[y * cw + x] = Float(cPtr[y * cRow + x * 2])
      V[y * cw + x] = Float(cPtr[y * cRow + x * 2 + 1])
    }
  }
  let q = rotation / 90 % 4
  let ry = rotatePlane(Y, w: w, h: h, quarter: q)
  let ru = rotatePlane(U, w: cw, h: ch, quarter: q), rv = rotatePlane(V, w: cw, h: ch, quarter: q)
  let ys = resample(ry.data, w: ry.w, h: ry.h, Resampler(src: ry.w, dst: outW), Resampler(src: ry.h, dst: outH))
  let crw = Resampler(src: ru.w, dst: outW / 2), crh = Resampler(src: ru.h, dst: outH)
  let us = resample(ru.data, w: ru.w, h: ru.h, crw, crh), vs = resample(rv.data, w: rv.w, h: rv.h, crw, crh)
  let kr: Float = 0.2126, kb: Float = 0.0722, kg: Float = 1 - 0.2126 - 0.0722
  var bgr = [UInt8](repeating: 0, count: outW * outH * 3)
  for y in 0 ..< outH {
    for x in 0 ..< outW {
      let yy = (ys[y * outW + x] - 16) * 255 / 219
      let c = y * (outW / 2) + x / 2
      let u = (us[c] - 128) * 255 / 224, v = (vs[c] - 128) * 255 / 224
      let b = yy + 2 * (1 - kb) * u
      let g = yy - 2 * kb * (1 - kb) / kg * u - 2 * kr * (1 - kr) / kg * v
      let r = yy + 2 * (1 - kr) * v
      let o = (y * outW + x) * 3
      bgr[o] = UInt8(min(max((b - ffmpegOffset[0]).rounded(), 0), 255))
      bgr[o + 1] = UInt8(min(max((g - ffmpegOffset[1]).rounded(), 0), 255))
      bgr[o + 2] = UInt8(min(max((r - ffmpegOffset[2]).rounded(), 0), 255))
    }
  }
  return BGRImage(width: outW, height: outH, data: bgr)
}

private func round1(_ v: Float) -> Double {
  (Double(v) * 10).rounded() / 10
}

func rotationDegrees(_ t: CGAffineTransform) -> Int {
  let deg = Int((atan2(Double(t.b), Double(t.a)) * 180 / .pi).rounded())
  return (deg + 360) % 360
}

func analyzePoseCoreML(url: URL, models: PoseModels, progress: (Double) -> Void) async throws -> [String: Any] {
  let asset = AVURLAsset(url: url)
  guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw PoseCoreMLError.noVideoTrack }
  let (natural, transform, nominalFps) = try await track.load(.naturalSize, .preferredTransform, .nominalFrameRate)
  let duration = try await asset.load(.duration).seconds
  let rotation = rotationDegrees(transform)
  let shown = natural.applying(transform)
  let (dispW, dispH) = (abs(shown.width), abs(shown.height))
  // pose.py: w = round(W * H / Hsrc / 2) * 2 at H = 1280
  let outW = Int((Double(dispW) * Double(poseInferHeight) / Double(dispH) / 2).rounded()) * 2

  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  ])
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { throw PoseCoreMLError.readFailed(reader.error?.localizedDescription ?? "reader") }

  var times: [Double] = []
  var people: [[PosePerson]] = []
  var first: Double?
  var sent = -1.0
  // One autorelease pool per frame: Core ML outputs and the decoder's buffers are
  // autoreleased, and this loop never returns to a run loop, so without it a 4K
  // clip piles up hundreds of frames in memory and iOS kills the app.
  var reading = true
  while reading {
    try autoreleasepool {
      guard let sample = output.copyNextSampleBuffer() else { reading = false; return }
      guard let pb = CMSampleBufferGetImageBuffer(sample) else { return }
      let pts = CMSampleBufferGetPresentationTimeStamp(sample).seconds
      if first == nil { first = pts }
      let img = uprightBGR(pb, rotation: rotation, outW: outW, outH: poseInferHeight)
      var row: [PosePerson] = []
      for box in try detectPeople(img, models) {
        let (k, s) = try estimatePose(img, box: box, models)
        row.append(PosePerson(box: box, kpts: k, scores: s))
      }
      times.append(pts - first!)
      people.append(row)
      let p = duration > 0 ? min(max((pts - first!) / duration, 0), 1) : 0
      if p - sent >= 0.02 { sent = p; progress(p) }
    }
  }
  if reader.status == .failed { throw PoseCoreMLError.readFailed(reader.error?.localizedDescription ?? "read") }

  let lifter = trackLifter(people)
  var frames: [[String: Any]] = []
  for (f, row) in people.enumerated() {
    var out: [[String: Any]] = []
    for p in row {
      var kp: [Any] = []
      for j in 0 ..< 26 {
        if headIdx.contains(j) {
          kp.append(NSNull())
        } else {
          let x = round1(p.kpts[j * 2]), y = round1(p.kpts[j * 2 + 1])
          let s = (Double(p.scores[j]) * 1000).rounded() / 1000
          kp.append([x, y, s])
        }
      }
      out.append(["box": p.box.map(round1), "kp": kp])
    }
    var frame: [String: Any] = ["t": (times[f] * 10000).rounded() / 10000, "people": out]
    if let i = lifter[f] { frame["lifter"] = i }
    frames.append(frame)
  }
  progress(1)
  return ["fps": Double(nominalFps), "width": outW, "height": poseInferHeight, "frames": frames]
}
