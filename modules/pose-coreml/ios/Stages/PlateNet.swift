import CoreML
import CoreVideo
import Foundation

// PlateNet (v40/plate-model: MobileNetV3-small with a CenterNet-style head at stride 4): where the plates are in a
// square of the frame. Input a 256 x 256 RGB crop, output four 64 x 64 maps: centre heat (logit), dx, dy (cells) and
// log(radius / 256). This stage only cuts the crop, runs the model and reads the peaks; which peak is the lifter's
// plate, frame after frame, is decided in TS (src/analysis/device/plateNet.ts), so that part ships by OTA.
let plateNetVersion = "v1"
let plateNetInput = 256, plateNetCells = 64, plateNetStride = 4.0
let plateNetPeaks = 3
// peaks under this are not recorded (the tracker's own bar is higher)
let plateNetFloor = 0.05

struct PlatePeak {
  let confidence: Double
  let centre: Point  // frame px
  let radius: Double
}

// The square of the frame centred on `centre`, `side` px wide, as the model's input: each output pixel the mean of
// the frame pixels under it (cv2.warpAffine INTER_AREA, as the training crops were cut), black outside the frame.
func plateNetCrop(_ img: BGRImage, centre: Point, side: Double) -> CVPixelBuffer? {
  var pb: CVPixelBuffer?
  let attrs = [kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any]] as CFDictionary
  guard CVPixelBufferCreate(nil, plateNetInput, plateNetInput, kCVPixelFormatType_32BGRA, attrs, &pb) == kCVReturnSuccess, let out = pb else { return nil }
  CVPixelBufferLockBaseAddress(out, [])
  defer { CVPixelBufferUnlockBaseAddress(out, []) }
  guard let base = CVPixelBufferGetBaseAddress(out) else { return nil }
  let stride = CVPixelBufferGetBytesPerRow(out)
  let dst = base.assumingMemoryBound(to: UInt8.self)
  let step = side / Double(plateNetInput)
  let x0 = centre.x - side / 2, y0 = centre.y - side / 2
  // the frame columns and rows under each output column and row
  func spans(_ o: Double, _ limit: Int) -> [(Int, Int)] {
    (0 ..< plateNetInput).map { i in
      let a = Int((o + Double(i) * step).rounded(.down)), b = max(a + 1, Int((o + Double(i + 1) * step).rounded(.up)))
      return (max(a, 0), min(b, limit))
    }
  }
  let cols = spans(x0, img.width), rows = spans(y0, img.height)
  let full = max(1, Int(step.rounded(.up)))
  img.data.withUnsafeBufferPointer { s in
    parallelRows(plateNetInput) { y in
      let (ya, yb) = rows[y]
      for x in 0 ..< plateNetInput {
        let (xa, xb) = cols[x]
        var b = 0, g = 0, r = 0
        if ya < yb, xa < xb {
          for yy in ya ..< yb {
            var i = (yy * img.width + xa) * 3
            for _ in xa ..< xb { b += Int(s[i]); g += Int(s[i + 1]); r += Int(s[i + 2]); i += 3 }
          }
        }
        // out-of-frame pixels count as black, so the sum is over the whole footprint
        let n = max((yb - ya) * (xb - xa), full * full)
        let o = y * stride + x * 4
        dst[o] = UInt8(b / n); dst[o + 1] = UInt8(g / n); dst[o + 2] = UInt8(r / n); dst[o + 3] = 255
      }
    }
  }
  return out
}

// The model's strongest centres in the crop, best first: local maxima of the heat over their 8 neighbours, each
// with its refined centre and radius, in frame px.
func plateNetPeaks(_ model: MLModel, _ img: BGRImage, centre: Point, side: Double) throws -> [PlatePeak] {
  guard centre.x.isFinite, centre.y.isFinite, side.isFinite, side > 8, let crop = plateNetCrop(img, centre: centre, side: side) else { return [] }
  let out = try model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["crop": MLFeatureValue(pixelBuffer: crop)]))
  guard let maps = out.featureValue(for: "maps")?.multiArrayValue else { throw StageError.invalid("plate_net: no maps") }
  let n = plateNetCells, plane = n * n
  var v = [Float](repeating: 0, count: 4 * plane)
  if maps.dataType == .float32 {
    maps.dataPointer.withMemoryRebound(to: Float.self, capacity: 4 * plane) { p in for i in 0 ..< 4 * plane { v[i] = p[i] } }
  } else {
    for i in 0 ..< 4 * plane { v[i] = maps[i].floatValue }
  }
  var found: [(Float, Int)] = []
  for y in 0 ..< n {
    for x in 0 ..< n {
      let h = v[y * n + x]
      var top = true
      for dy in -1 ... 1 where top {
        for dx in -1 ... 1 where !(dx == 0 && dy == 0) {
          let yy = y + dy, xx = x + dx
          if yy >= 0, xx >= 0, yy < n, xx < n, v[yy * n + xx] > h || (v[yy * n + xx] == h && (dy < 0 || (dy == 0 && dx < 0))) { top = false; break }
        }
      }
      if top { found.append((h, y * n + x)) }
    }
  }
  let scale = side / Double(plateNetInput)
  return found.sorted { $0.0 > $1.0 }.prefix(plateNetPeaks).compactMap { h, i in
    let conf = 1 / (1 + exp(-Double(h)))
    guard conf >= plateNetFloor else { return nil }
    let cx = (Double(i % n) + 0.5 + Double(v[plane + i])) * plateNetStride
    let cy = (Double(i / n) + 0.5 + Double(v[2 * plane + i])) * plateNetStride
    let r = exp(Double(v[3 * plane + i])) * Double(plateNetInput)
    return PlatePeak(confidence: conf, centre: Point(centre.x - side / 2 + cx * scale, centre.y - side / 2 + cy * scale), radius: r * scale)
  }
}
