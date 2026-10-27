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
  case interrupted

  var description: String {
    switch self {
    case .noVideoTrack: return "no_video_track: the file has no video track"
    case .readFailed(let s): return "clip_unreadable: \(s)"
    case .model(let s): return "models_unavailable: \(s)"
    case .interrupted: return "interrupted: the system ended the run in the background"
    }
  }
}

let poseInferHeight = 1280
private let detSize = 640
private let poseW = 192, poseH = 256
let headIdx: Set<Int> = [0, 1, 2, 3, 4, 17]
private let poseMean: [Float] = [123.675, 116.28, 103.53]
private let poseStd: [Float] = [58.395, 57.12, 57.375]

struct PosePerson {
  var box: [Float]       // x1 y1 x2 y2
  var kpts: [Float]      // 26 * (x, y)
  var scores: [Float]    // 26

  // Detected but not run through RTMPose: NaN joints never pass select_lifter's joint-shift test
  static func unposed(box: [Float]) -> PosePerson {
    PosePerson(box: box, kpts: [Float](repeating: .nan, count: 52), scores: [Float](repeating: 0, count: 26))
  }
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

// cv2.resize(INTER_LINEAR)'s sample positions along one axis: half-pixel centres, edge clamp.
// Returns, per output index, the two source indices and the weight of the second.
private func linearTaps(src: Int, dst: Int) -> (i0: [Int], i1: [Int], w1: [Float]) {
  var i0 = [Int](repeating: 0, count: dst), i1 = i0, w1 = [Float](repeating: 0, count: dst)
  let scale = Float(src) / Float(dst)
  for d in 0 ..< dst {
    var f = (Float(d) + 0.5) * scale - 0.5
    if f < 0 { f = 0 }
    var a = Int(f)
    if a >= src - 1 { a = src - 1; f = Float(a) }
    i0[d] = a
    i1[d] = min(a + 1, src - 1)
    w1[d] = f - Float(a)
  }
  return (i0, i1, w1)
}

// Separable bilinear resampling of an 8-bit BGR image into three float planes (one per channel,
// `rowStride` floats per row, written at `dst` + c * planeStride): rows blended with vDSP, columns
// gathered. The same values as the per-pixel cv2.resize(INTER_LINEAR) port, rounded to nearest and
// clamped to 0...255, in a few vector calls per row. A row tap of src.height reads a zero row and a
// column tap of src.width the zero pixel past the row's end, so out-of-frame samples are 0 (warpAffine).
private func bilinearRows(_ src: BGRImage, rows: (i0: [Int], i1: [Int], w1: [Float]), cols: (i0: [Int], i1: [Int], w1: [Float]),
                          outW: Int, dst: UnsafeMutablePointer<Float>, rowStride: Int, planeStride: Int) {
  let w = src.width, n = outW
  let rowLen = w * 3 + 3  // + one zero pixel
  var rowA = [Float](repeating: 0, count: rowLen), rowB = rowA, blend = rowA
  var cacheA = -1, cacheB = -1
  var idx0 = [[vDSP_Length]](repeating: [vDSP_Length](repeating: 0, count: n), count: 3), idx1 = idx0
  for c in 0 ..< 3 {
    for x in 0 ..< n {
      idx0[c][x] = vDSP_Length(cols.i0[x] * 3 + c + 1)  // vgathr indices are 1-based
      idx1[c][x] = vDSP_Length(cols.i1[x] * 3 + c + 1)
    }
  }
  var w0 = cols.w1.map { 1 - $0 }, w1 = cols.w1
  var g0 = [Float](repeating: 0, count: n), g1 = g0
  src.data.withUnsafeBufferPointer { s in
    func load(_ r: Int, into buf: inout [Float]) {
      if r >= src.height { vDSP_vclr(&buf, 1, vDSP_Length(w * 3)); return }
      vDSP_vfltu8(s.baseAddress! + r * w * 3, 1, &buf, 1, vDSP_Length(w * 3))
    }
    for y in 0 ..< rows.i0.count {
      let out = dst + y * rowStride
      if cacheA != rows.i0[y] { cacheA = rows.i0[y]; load(cacheA, into: &rowA) }
      if cacheB != rows.i1[y] { cacheB = rows.i1[y]; load(cacheB, into: &rowB) }
      var wy1 = rows.w1[y], wy0 = 1 - wy1
      vDSP_vsmsma(rowA, 1, &wy0, rowB, 1, &wy1, &blend, 1, vDSP_Length(w * 3))
      for c in 0 ..< 3 {
        vDSP_vgathr(blend, idx0[c], 1, &g0, 1, vDSP_Length(n))
        vDSP_vgathr(blend, idx1[c], 1, &g1, 1, vDSP_Length(n))
        let o = out + c * planeStride
        vDSP_vmma(g0, 1, &w0, 1, g1, 1, &w1, 1, o, 1, vDSP_Length(n))
        // Float.rounded() (half away from zero) on values >= 0: floor(v + 0.5). A 2x downscale lands every sample
        // on a .5 tie, so round-half-even (vvnintf) would move a quarter of the detector's pixels by one.
        var half: Float = 0.5, cnt = Int32(n)
        vDSP_vsadd(o, 1, &half, o, 1, vDSP_Length(n))
        vvfloorf(o, o, &cnt)
        var lo: Float = 0, hi: Float = 255
        vDSP_vclip(o, 1, &lo, &hi, o, 1, vDSP_Length(n))
      }
    }
  }
}

// MLShapedArray(converting:) copies element by element; an output laid out as rows of its last axis (the Neural
// Engine pads each row, e.g. 4 floats to 32) is read row by row instead: float32 copied, float16 (the FP16
// detector's) widened by vImage in one call
private func floats(_ m: MLMultiArray) -> [Float] {
  let n = m.count, d = m.shape.count
  let last = d > 0 ? m.shape[d - 1].intValue : 1
  var rowsLaidOut = d > 0 && m.strides[d - 1].intValue == 1 && (m.dataType == .float32 || m.dataType == .float16) && n > 0
  if rowsLaidOut {
    for i in stride(from: d - 3, through: 0, by: -1) where m.strides[i].intValue != m.strides[i + 1].intValue * m.shape[i + 1].intValue {
      rowsLaidOut = false
    }
  }
  guard rowsLaidOut else { return MLShapedArray<Float>(converting: m).scalars }
  let rows = n / last, rowStride = d > 1 ? m.strides[d - 2].intValue : last
  var out = [Float](repeating: 0, count: n)
  out.withUnsafeMutableBufferPointer { dst in
    if m.dataType == .float32 {
      let src = m.dataPointer.assumingMemoryBound(to: Float.self)
      if rowStride == last { dst.baseAddress!.update(from: src, count: n); return }
      for r in 0 ..< rows { (dst.baseAddress! + r * last).update(from: src + r * rowStride, count: last) }
    } else {
      var s = vImage_Buffer(data: m.dataPointer, height: vImagePixelCount(rows), width: vImagePixelCount(last), rowBytes: rowStride * 2)
      var t = vImage_Buffer(data: dst.baseAddress!, height: vImagePixelCount(rows), width: vImagePixelCount(last), rowBytes: last * 4)
      _ = vImageConvert_Planar16FtoPlanarF(&s, &t, vImage_Flags(kvImageNoFlags))
    }
  }
  return out
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
  let input = try MLMultiArray(shape: [1, 3, NSNumber(value: detSize), NSNumber(value: detSize)], dataType: .float32)
  let plane = detSize * detSize
  let p = input.dataPointer.bindMemory(to: Float.self, capacity: 3 * plane)
  var pad: Float = 114
  vDSP_vfill(&pad, p, 1, vDSP_Length(3 * plane))
  bilinearRows(img, rows: linearTaps(src: img.height, dst: rh), cols: linearTaps(src: img.width, dst: rw), outW: rw,
               dst: p, rowStride: detSize, planeStride: plane)
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
func estimatePose(_ img: BGRImage, box: [Float], _ models: PoseModels, stripHead: Bool = true) throws -> (kpts: [Float], scores: [Float]) {
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
  // warpAffine as separable bilinear taps; a sample outside the frame reads the zero row / zero pixel (border 0)
  var rows = (i0: [Int](repeating: 0, count: poseH), i1: [Int](repeating: 0, count: poseH), w1: [Float](repeating: 0, count: poseH))
  for y in 0 ..< poseH {
    let fy = (Float(y) - ty) / s
    let y0 = Int(fy.rounded(.down))
    rows.w1[y] = fy - Float(y0)
    rows.i0[y] = y0 >= 0 && y0 < img.height ? y0 : img.height
    rows.i1[y] = y0 + 1 >= 0 && y0 + 1 < img.height ? y0 + 1 : img.height
  }
  var cols = (i0: [Int](repeating: 0, count: poseW), i1: [Int](repeating: 0, count: poseW), w1: [Float](repeating: 0, count: poseW))
  for x in 0 ..< poseW {
    let fx = (Float(x) - tx) / s
    let x0 = Int(fx.rounded(.down))
    cols.w1[x] = fx - Float(x0)
    cols.i0[x] = x0 >= 0 && x0 < img.width ? x0 : img.width
    cols.i1[x] = x0 + 1 >= 0 && x0 + 1 < img.width ? x0 + 1 : img.width
  }
  bilinearRows(img, rows: rows, cols: cols, outW: poseW, dst: p, rowStride: poseW, planeStride: plane)
  for c in 0 ..< 3 {
    var m = -poseMean[c], sd = poseStd[c]
    vDSP_vsadd(p + c * plane, 1, &m, p + c * plane, 1, vDSP_Length(plane))
    vDSP_vsdiv(p + c * plane, 1, &sd, p + c * plane, 1, vDSP_Length(plane))
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
  if stripHead { for j in headIdx { kpts[j * 2] = .nan; kpts[j * 2 + 1] = .nan; scores[j] = 0 } }
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

// One separable pass along rows: plane (h x w) -> (r.n x w), each output row a weighted sum of
// source rows (contiguous, vDSP_vsma per tap).
private func resampleRows(_ p: UnsafePointer<Float>, w: Int, h: Int, _ r: Resampler, into dst: UnsafeMutablePointer<Float>) {
  let th = r.taps
  vDSP_vclr(dst, 1, vDSP_Length(r.n * w))
  for y in 0 ..< r.n {
    let o = dst + y * w
    for t in 0 ..< th {
      var wy = r.w[y * th + t]
      vDSP_vsma(p + r.idx[y * th + t] * w, 1, &wy, o, 1, o, 1, vDSP_Length(w))
    }
  }
}

// plane (h x w) -> (rh.n x rw.n): rows first, then the columns as a rows pass on the transpose
// (vDSP_mtrans both ways), so every tap is a contiguous vector op.
func resample(_ p: [Float], w: Int, h: Int, _ rw: Resampler, _ rh: Resampler) -> [Float] {
  var tmp = [Float](repeating: 0, count: rh.n * w)
  p.withUnsafeBufferPointer { src in tmp.withUnsafeMutableBufferPointer { resampleRows(src.baseAddress!, w: w, h: h, rh, into: $0.baseAddress!) } }
  var tmpT = [Float](repeating: 0, count: w * rh.n)  // w rows x rh.n cols
  vDSP_mtrans(tmp, 1, &tmpT, 1, vDSP_Length(w), vDSP_Length(rh.n))
  var outT = [Float](repeating: 0, count: rw.n * rh.n)  // rw.n rows x rh.n cols
  tmpT.withUnsafeBufferPointer { src in outT.withUnsafeMutableBufferPointer { resampleRows(src.baseAddress!, w: rh.n, h: w, rw, into: $0.baseAddress!) } }
  var out = [Float](repeating: 0, count: rh.n * rw.n)
  vDSP_mtrans(outT, 1, &out, 1, vDSP_Length(rh.n), vDSP_Length(rw.n))
  return out
}

// Rotate a float plane clockwise by quarter turns (exact): a transpose plus a row or order reversal.
func rotatePlane(_ p: [Float], w: Int, h: Int, quarter: Int) -> (data: [Float], w: Int, h: Int) {
  let q = quarter % 4
  if q == 0 { return (p, w, h) }
  if q == 2 {
    var out = p  // out[h - 1 - y][w - 1 - x] = p[y][x]: the flat array reversed
    vDSP_vrvrs(&out, 1, vDSP_Length(w * h))
    return (out, w, h)
  }
  var t = [Float](repeating: 0, count: w * h)  // w rows x h cols: t[x][y] = p[y][x]
  vDSP_mtrans(p, 1, &t, 1, vDSP_Length(w), vDSP_Length(h))
  if q == 1 {
    // out[x][h - 1 - y] = p[y][x]: every row of t reversed
    t.withUnsafeMutableBufferPointer { b in for x in 0 ..< w { vDSP_vrvrs(b.baseAddress! + x * h, 1, vDSP_Length(h)) } }
    return (t, h, w)
  }
  // q == 3: out[w - 1 - x][y] = p[y][x]: the rows of t in reverse order
  var out = [Float](repeating: 0, count: w * h)
  t.withUnsafeBufferPointer { src in out.withUnsafeMutableBufferPointer { dst in
    for x in 0 ..< w { cblas_scopy(Int32(h), src.baseAddress! + x * h, 1, dst.baseAddress! + (w - 1 - x) * h, 1) }
  } }
  return (out, h, w)
}

// ffmpeg's YUV -> bgr24 sits this much below an exact BT.709 limited-range
// conversion (B, G, R; measured against ffmpeg 8.1 on three clips, slope 1.000).
private let ffmpegOffset: [Float] = [2.1, 1.85, 2.2]

// One plane of the pixel buffer as floats (optionally every `step`th byte from `offset`).
private func planeFloats(_ base: UnsafePointer<UInt8>, rowBytes: Int, w: Int, h: Int, step: Int = 1) -> [Float] {
  var out = [Float](repeating: 0, count: w * h)
  out.withUnsafeMutableBufferPointer { o in
    for y in 0 ..< h { vDSP_vfltu8(base + y * rowBytes, vDSP_Stride(step), o.baseAddress! + y * w, 1, vDSP_Length(w)) }
  }
  return out
}

// The upright frame at outW x outH, BGR, as pose.py's `ffmpeg -vf scale -pix_fmt bgr24`
// pipe produces it: the decoded 4:2:0 planes (bit-exact H.264 output) rotated
// losslessly, luma and chroma scaled bicubically in YUV, chroma shared by pixel
// pairs, then BT.709 limited range to BGR. All of it in vDSP / BLAS calls: no per-pixel Swift.
// The decoded 4:2:0 planes as floats, already rotated upright: read once per frame, scaled to each height
// the frame is needed at (1280 for pose, 360 for the camera path) without converting twice.
struct UprightPlanes {
  let y: (data: [Float], w: Int, h: Int)
  let u: (data: [Float], w: Int, h: Int)
  let v: (data: [Float], w: Int, h: Int)

  init(_ pb: CVPixelBuffer, rotation: Int) {
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    let w = CVPixelBufferGetWidthOfPlane(pb, 0), h = CVPixelBufferGetHeightOfPlane(pb, 0)
    let cw = CVPixelBufferGetWidthOfPlane(pb, 1), ch = CVPixelBufferGetHeightOfPlane(pb, 1)
    let yRow = CVPixelBufferGetBytesPerRowOfPlane(pb, 0), cRow = CVPixelBufferGetBytesPerRowOfPlane(pb, 1)
    let yPtr = CVPixelBufferGetBaseAddressOfPlane(pb, 0)!.assumingMemoryBound(to: UInt8.self)
    let cPtr = CVPixelBufferGetBaseAddressOfPlane(pb, 1)!.assumingMemoryBound(to: UInt8.self)
    let q = rotation / 90 % 4
    y = rotatePlane(planeFloats(yPtr, rowBytes: yRow, w: w, h: h), w: w, h: h, quarter: q)
    u = rotatePlane(planeFloats(cPtr, rowBytes: cRow, w: cw, h: ch, step: 2), w: cw, h: ch, quarter: q)
    v = rotatePlane(planeFloats(cPtr + 1, rowBytes: cRow, w: cw, h: ch, step: 2), w: cw, h: ch, quarter: q)
  }
}

func uprightBGR(_ pb: CVPixelBuffer, rotation: Int, outW: Int, outH: Int) -> BGRImage {
  uprightBGR(UprightPlanes(pb, rotation: rotation), outW: outW, outH: outH)
}

func uprightBGR(_ planes: UprightPlanes, outW: Int, outH: Int) -> BGRImage {
  let (ry, ru, rv) = (planes.y, planes.u, planes.v)
  let ys = resample(ry.data, w: ry.w, h: ry.h, Resampler(src: ry.w, dst: outW), Resampler(src: ry.h, dst: outH))
  let crw = Resampler(src: ru.w, dst: outW / 2), crh = Resampler(src: ru.h, dst: outH)
  let us = resample(ru.data, w: ru.w, h: ru.h, crw, crh), vs = resample(rv.data, w: rv.w, h: rv.h, crw, crh)
  let kr: Float = 0.2126, kb: Float = 0.0722, kg: Float = 1 - 0.2126 - 0.0722
  let n = outW * outH, half = n / 2
  // yy = (Y - 16) * 255 / 219; u, v = (C - 128) * 255 / 224; then b = yy + 2 (1 - kb) u, etc., minus ffmpeg's offset
  var yy = [Float](repeating: 0, count: n)
  var ya: Float = 255 / 219, yb: Float = -16 * 255 / 219
  vDSP_vsmsa(ys, 1, &ya, &yb, &yy, 1, vDSP_Length(n))
  let cs: Float = 255 / 224
  let cb = cs * 2 * (1 - kb), cgU = -cs * 2 * kb * (1 - kb) / kg, cgV = -cs * 2 * kr * (1 - kr) / kg, cr = cs * 2 * (1 - kr)
  var halfPlane = [Float](repeating: 0, count: half), full = [Float](repeating: 0, count: n)
  var bgr = [UInt8](repeating: 0, count: n * 3)
  var lo: Float = 0, hi: Float = 255
  func channel(_ c: Int, _ mu: Float, _ mv: Float) {
    var a = mu, b = -128 * (mu + mv) - ffmpegOffset[c]
    vDSP_vsmsa(us, 1, &a, &b, &halfPlane, 1, vDSP_Length(half))
    if mv != 0 { var m = mv; vDSP_vsma(vs, 1, &m, halfPlane, 1, &halfPlane, 1, vDSP_Length(half)) }
    // chroma shared by pixel pairs: half[k] -> full[2k], full[2k + 1]
    cblas_scopy(Int32(half), halfPlane, 1, &full, 2)
    full.withUnsafeMutableBufferPointer { cblas_scopy(Int32(half), halfPlane, 1, $0.baseAddress! + 1, 2) }
    vDSP_vadd(yy, 1, full, 1, &full, 1, vDSP_Length(n))
    vDSP_vclip(full, 1, &lo, &hi, &full, 1, vDSP_Length(n))
    bgr.withUnsafeMutableBufferPointer { vDSP_vfixru8(full, 1, $0.baseAddress! + c, 3, vDSP_Length(n)) }
  }
  channel(0, cb, 0)
  channel(1, cgU, cgV)
  channel(2, 0, cr)
  return BGRImage(width: outW, height: outH, data: bgr)
}

private func round1(_ v: Float) -> Double {
  (Double(v) * 10).rounded() / 10
}

func rotationDegrees(_ t: CGAffineTransform) -> Int {
  let deg = Int((atan2(Double(t.b), Double(t.a)) * 180 / .pi).rounded())
  return (deg + 360) % 360
}

// twoPass: pose.py two_pass for kipping HSPU (Stages/InvertedPass.swift).
func analyzePoseCoreML(url: URL, models: PoseModels, twoPass: Bool = false, progress: (Double) -> Void) async throws -> [String: Any] {
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
        let (k, s) = try estimatePose(img, box: box, models, stripHead: !twoPass)
        row.append(PosePerson(box: box, kpts: k, scores: s))
      }
      if twoPass { row = try invertedPass(img, upright: row, models) }
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
