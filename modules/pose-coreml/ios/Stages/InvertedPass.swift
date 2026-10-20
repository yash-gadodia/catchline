import Foundation

// cv/catchline_cv/pose.py two_pass: the kipping HSPU second pass. The frame is
// rotated 180 degrees, detected and posed again, the result mapped back to the
// upright frame (unrotate) and merged per person with the upright pass, keeping
// whichever pass scored higher (merge_passes). Signatures in StageAPI.swift.

// np.ascontiguousarray(img[::-1, ::-1]): a rotation, not a mirror, channels kept.
func rotate180(_ img: BGRImage) throws -> BGRImage {
  let n = img.width * img.height
  guard img.data.count == n * 3 else { throw StageError.invalid("rotate180: \(img.data.count) bytes for \(img.width)x\(img.height)") }
  var out = [UInt8](repeating: 0, count: n * 3)
  img.data.withUnsafeBufferPointer { s in
    for i in 0 ..< n {
      let o = (n - 1 - i) * 3
      out[o] = s[i * 3]; out[o + 1] = s[i * 3 + 1]; out[o + 2] = s[i * 3 + 2]
    }
  }
  return BGRImage(width: img.width, height: img.height, data: out)
}

// pose.py unrotate: detections made on the rotated frame back to upright pixels.
// Anatomical left/right labels stay as they are (no flip_idx swap).
func unrotate(_ people: [PosePerson], width: Int, height: Int) throws -> [PosePerson] {
  let w = Float(width), h = Float(height)
  return people.map { p in
    var k = p.kpts
    for j in 0 ..< 26 { k[j * 2] = w - p.kpts[j * 2]; k[j * 2 + 1] = h - p.kpts[j * 2 + 1] }
    return PosePerson(box: [w - p.box[2], h - p.box[3], w - p.box[0], h - p.box[1]], kpts: k, scores: p.scores)
  }
}

private func iou(_ a: [Float], _ b: [Float]) -> Float {
  let iw = max(0, min(a[2], b[2]) - max(a[0], b[0])), ih = max(0, min(a[3], b[3]) - max(a[1], b[1]))
  let inter = iw * ih
  return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9)
}

private func meanScore(_ p: PosePerson) -> Float {
  p.scores.reduce(0, +) / Float(p.scores.count)
}

// pose.py merge_passes: per upright person the best-IoU rotated person (first on
// ties, IoU >= minIoU, each rotated person used once) replaces it when its mean
// keypoint score is higher; unmatched rotated people are appended. Scores are the
// 26 raw values, head points included, as in Python before strip_head.
func mergePasses(upright: [PosePerson], rotated: [PosePerson], minIoU: Float = 0.3) throws -> [PosePerson] {
  var out: [PosePerson] = []
  var used = Set<Int>()
  for p in upright {
    var j: Int?
    var best = -Float.infinity
    for (i, r) in rotated.enumerated() {
      let v = iou(p.box, r.box)
      if v > best { best = v; j = i }
    }
    if let j, !used.contains(j), best >= minIoU {
      used.insert(j)
      out.append(meanScore(rotated[j]) > meanScore(p) ? rotated[j] : p)
    } else {
      out.append(p)
    }
  }
  out += rotated.enumerated().filter { !used.contains($0.offset) }.map { $0.element }
  return out
}

// Drop the head keypoints (NaN, score 0) once the merge no longer needs them.
func stripHead(_ p: PosePerson) -> PosePerson {
  var p = p
  for j in headIdx { p.kpts[j * 2] = .nan; p.kpts[j * 2 + 1] = .nan; p.scores[j] = 0 }
  return p
}

// One frame, both passes, merged, head points dropped. `upright` is the first pass
// with head scores still in (estimatePose(stripHead: false)).
func invertedPass(_ img: BGRImage, upright: [PosePerson], _ models: PoseModels) throws -> [PosePerson] {
  let flipped = try rotate180(img)
  var rotated: [PosePerson] = []
  for box in try detectPeople(flipped, models) {
    let (k, s) = try estimatePose(flipped, box: box, models, stripHead: false)
    rotated.append(PosePerson(box: box, kpts: k, scores: s))
  }
  return try mergePasses(upright: upright, rotated: try unrotate(rotated, width: img.width, height: img.height)).map(stripHead)
}
