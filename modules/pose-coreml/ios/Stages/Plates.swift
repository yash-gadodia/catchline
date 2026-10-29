import Accelerate
import Foundation

// track.py plate_mask, find_plates, refine_plate and track_plate (one step), ported step for step so the
// phone gives the server's plate fits: the same colour mask (cv2's integer HSV), the same morphology,
// the same sampled ellipse search over the same candidate grids (numpy's linspace and half-to-even
// rounding), and in refine_plate cv2's contour tracing, its fitEllipse and numpy's seeded RANSAC sampling.
// The mask is only computed where a search samples it (grown by the morphology's reach, so it equals
// the full-frame mask there). Signatures in StageAPI.swift.

// MARK: - find_plates / track_plate

func findPlates(_ img: BGRImage, wristA: Point, wristB: Point, bodyH: Double, setupH: Double?) throws -> [Plate] {
  // a NaN anywhere in the wrists or the body height makes every Python candidate NaN, every sample
  // out of frame and every score -0.5, so find_plates returns []: same answer, without the mask
  guard wristA.x.isFinite, wristA.y.isFinite, wristB.x.isFinite, wristB.y.isFinite, bodyH.isFinite else { return [] }
  let d = wristB - wristA
  let L = (d.x * d.x + d.y * d.y).squareRoot()
  let ratios = linspace(0.5, 1.0, 6)
  var out: [Plate] = []
  if L >= 0.35 * bodyH {
    let nrm = Point(-d.y, d.x) / L
    for (side, ts) in [("a", linspace(-3.0, -0.15, 50)), ("b", linspace(1.15, 4.0, 50))] {
      var cands: [Point] = []
      for t in ts {
        for o in linspace(-0.4, 0.4, 9) { cands.append(wristA + t * d + o * nrm * L) }
      }
      if var p = bestPlate(img, cands, linspace(0.12, 0.5, 20).map { $0 * bodyH }, ratios, preferLarge: false) {
        p.side = side
        out.append(p)
      }
    }
  }
  if out.isEmpty {
    let c = (wristA + wristB) / 2
    let sh = (setupH == nil || setupH == 0) ? bodyH : setupH!
    var cands: [Point] = []
    for dx in linspace(-0.5, 0.5, 31) {
      for dy in linspace(-0.1, 0.8, 28) { cands.append(c + Point(dx * sh, dy * sh)) }
    }
    if var p = bestPlate(img, cands, linspace(0.15, 1.3, 30).map { $0 * sh }, ratios, preferLarge: true) {
      p.side = "near"
      out.append(p)
    }
  }
  // sorted(key=-axes[0]) is stable
  return out.enumerated().sorted { ($0.element.axes.0 > $1.element.axes.0) || ($0.element.axes.0 == $1.element.axes.0 && $0.offset < $1.offset) }.map { $0.element }
}

func trackPlateStep(_ img: BGRImage, _ track: inout PlateTrack) throws {
  let (M0, m0) = track.axes
  let pred = track.centre + track.velocity
  let g = linspace(-0.3, 0.3, 13).map { $0 * M0 }
  var cands: [Point] = []
  for dx in g { for dy in g { cands.append(pred + Point(dx, dy)) } }
  // the seed's horizontal axis may exceed its vertical one (a refined fit), so the ring can reach 0.75 m0
  let m = plateMask(img, around: cands, reach: 0.76 * max(M0, m0) + 0.03 * M0)
  let q = m0 / M0
  guard let p = ellipseSearch(m, cands, [M0 * 0.92, M0 * 1.0, M0 * 1.08], [q * 0.9, q * 1.0, q * 1.1]),
        p.score >= 0.45, p.centre.y - p.axes.0 / 2 >= 0 else {
    track.lost = true
    return
  }
  let c = refineCentre(m, p)
  track.velocity = c - track.centre
  track.centre = c
  track.score = p.score
}

private func bestPlate(_ img: BGRImage, _ cands: [Point], _ majors: [Double], _ ratios: [Double], preferLarge: Bool) -> Plate? {
  let m = plateMask(img, around: cands, reach: 0.7 * (majors.max() ?? 0) * 1.08)
  var p: Plate?
  if preferLarge {
    let fits = majors.compactMap { ellipseSearch(m, cands, [$0], ratios) }
    let top = fits.map { $0.score }.max() ?? -1
    for f in fits where f.score >= top - 0.15 {
      if p == nil || f.axes.0 > p!.axes.0 { p = f }
    }
  } else {
    p = ellipseSearch(m, cands, majors, ratios)
  }
  guard let p0 = p else { return nil }
  let g = linspace(-0.06, 0.06, 9).map { $0 * p0.axes.0 }
  let M0 = p0.axes.0, q0 = p0.axes.1 / p0.axes.0
  var fine: [Point] = []
  for dx in g { for dy in g { fine.append(p0.centre + Point(dx, dy)) } }
  let r = ellipseSearch(m, fine, linspace(0.92, 1.08, 9).map { M0 * $0 },
                        linspace(-0.1, 0.1, 11).map { min(max(q0 + $0, 0.3), 1.0) })
  return (r?.score ?? -1) > 0.5 ? r : nil
}

// Sample offsets of a vertical-major ellipse: 5 inner rings of 24 points and 2 outer rings of 36.
private func ellipseOffsets(_ major: Double, _ ratio: Double) -> (inner: [Point], ring: [Point]) {
  let th = linspace(0, 2 * Double.pi, 24, endpoint: false)
  let th2 = linspace(0, 2 * Double.pi, 36, endpoint: false)
  let a = major / 2 * ratio, b = major / 2
  var inner: [Point] = []
  for r in [0.15, 0.35, 0.55, 0.75, 0.9] { for t in th { inner.append(Point(r * a * cos(t), r * b * sin(t))) } }
  var ring: [Point] = []
  for r in [1.12, 1.25] { for t in th2 { ring.append(Point(r * a * cos(t), r * b * sin(t))) } }
  return (inner, ring)
}

// Fraction of sample points on the mask and the fraction inside the frame (np.round is half to even).
private func sample(_ m: RoiMask, _ centre: Point, _ offs: [Point]) -> (fill: Double, inside: Double) {
  var hit = 0, ok = 0
  for o in offs {
    let p = centre + o
    guard p.x.isFinite, p.y.isFinite else { continue }
    let x = p.x.rounded(.toNearestOrEven), y = p.y.rounded(.toNearestOrEven)
    guard x >= 0, x < Double(m.frameWidth), y >= 0, y < Double(m.frameHeight) else { continue }
    ok += 1
    if m.at(Int(x), Int(y)) > 0 { hit += 1 }
  }
  return (Double(hit) / Double(offs.count), Double(ok) / Double(offs.count))
}

private func fillScore(_ m: RoiMask, _ c: Point, _ offs: (inner: [Point], ring: [Point])) -> Double {
  let vi = sample(m, c, offs.inner), vo = sample(m, c, offs.ring)
  return vi.fill - vo.fill - 0.5 * (1 - vi.inside)
}

// track.py ellipse_search: the best (ratio, centre) per major, the first of a tied score winning, and
// across majors a strictly better score.
private func ellipseSearch(_ m: RoiMask, _ centres: [Point], _ majors: [Double], _ ratios: [Double]) -> Plate? {
  var best: Plate?
  var bestScore = -1.0
  for M in majors {
    var top = -Double.infinity
    var topQ = 0.0, topC = Point(0, 0)
    for q in ratios {
      let offs = ellipseOffsets(M, q)
      let scores = parallelMap(centres.count) { fillScore(m, centres[$0], offs) }
      for (c, s) in zip(centres, scores) where s > top { top = s; topQ = q; topC = c }
    }
    if top > bestScore {
      bestScore = top
      best = Plate(centre: topC, axes: (M, M * topQ), score: top, side: "", fitInliers: nil)
    }
  }
  return best
}

// track.py refine_centre: the centroid of the top-scoring candidates on a fine grid.
private func refineCentre(_ m: RoiMask, _ p: Plate) -> Point {
  let M = p.axes.0
  let offs = ellipseOffsets(M, p.axes.1 / M)
  let g = linspace(-0.025, 0.025, 11).map { $0 * M }
  var cands: [Point] = []
  for dy in g { for dx in g { cands.append(p.centre + Point(dx, dy)) } }
  let scores = cands.map { fillScore(m, $0, offs) }
  let top = scores.max()!
  var sum = Point(0, 0), n = 0.0
  for (c, s) in zip(cands, scores) where s >= top - 1e-9 { sum += c; n += 1 }
  return sum / n
}

// f(i) for every i, computed on all cores in chunks; the result order is fixed, so every reduction over
// it (argmax, first max) is the sequential one.
func parallelMap<T>(_ n: Int, _ f: (Int) -> T) -> [T] {
  if n == 0 { return [] }
  let chunks = min(n, max(1, ProcessInfo.processInfo.activeProcessorCount * 4))
  return withoutActuallyEscaping(f) { f in
    [T](unsafeUninitializedCapacity: n) { buf, count in
      let p = buf.baseAddress!
      DispatchQueue.concurrentPerform(iterations: chunks) { k in
        let lo = n * k / chunks, hi = n * (k + 1) / chunks
        for i in lo ..< hi { (p + i).initialize(to: f(i)) }
      }
      count = n
    }
  }
}

// f(y) for every row, in chunks on all cores (each row writes only its own pixels).
func parallelRows(_ n: Int, _ f: (Int) -> Void) {
  if n == 0 { return }
  let chunks = min(n, max(1, ProcessInfo.processInfo.activeProcessorCount * 2))
  withoutActuallyEscaping(f) { f in
    DispatchQueue.concurrentPerform(iterations: chunks) { k in
      for y in (n * k / chunks) ..< (n * (k + 1) / chunks) { f(y) }
    }
  }
}

// numpy.linspace, element by element: i * step + start, the last set to stop.
func linspace(_ start: Double, _ stop: Double, _ num: Int, endpoint: Bool = true) -> [Double] {
  let step = (stop - start) / Double(endpoint ? num - 1 : num)
  var y = (0 ..< num).map { Double($0) * step + start }
  if endpoint && num > 1 { y[num - 1] = stop }
  return y
}

// MARK: - follow_plate

func startPlate(_ img: BGRImage, _ gray: GrayImage, wrist: Point, wristA: Point, wristB: Point, bodyH: Double, setupH: Double) throws -> Plate? {
  guard wrist.x.isFinite, wrist.y.isFinite, setupH.isFinite, setupH > 0 else { return nil }
  var cands = try findPlates(img, wristA: wristA, wristB: wristB, bodyH: bodyH, setupH: setupH)
  for p in cands { if let r = try refinePlate(img, p) { cands.append(r) } }
  var centres: [Point] = []
  for dx in linspace(-0.3, 0.3, 25) { for dy in linspace(-0.1, 0.3, 17) { centres.append(wrist + Point(dx * setupH, dy * setupH)) } }
  let majors = linspace(0.3, 0.75, 10).map { $0 * setupH }
  let G = gradient(gray, around: centres + cands.map { $0.centre }, reach: 0.6 * max(majors.last!, cands.map { max($0.axes.0, $0.axes.1) }.max() ?? 0))
  let m = plateMask(img, around: centres, reach: 0.7 * majors.last!)
  if let p = searchPlate(m, G, centres, majors, [0.6, 0.8, 1.0]) { cands.append(p) }
  var scored: [(Plate, Double)] = []
  for var p in cands where p.centre.x.isFinite && p.centre.y.isFinite {
    let M = max(p.axes.0, p.axes.1), d = p.centre - wrist
    guard M >= 0.3 * setupH, M <= 0.8 * setupH, abs(d.x) < 0.6 * setupH, abs(d.y) < 0.5 * setupH else { continue }
    let r = rimSupport(G, p.centre, p.axes.0, p.axes.1 / p.axes.0)
    guard r.inside >= 0.6 else { continue }
    p.score = r.rim
    scored.append((p, r.rim))
  }
  guard let top = scored.map({ $0.1 }).max(), top >= 0.4 else { return nil }
  var best: Plate?
  for (p, r) in scored where r >= top - 0.05 && (best == nil || p.axes.0 > best!.axes.0) { best = p }
  return best
}

func followPlateStep(_ img: BGRImage, _ gray: GrayImage, _ s: inout PlateFollow, wrist: Point) -> Int {
  defer { s.prev = gray }
  let M = s.major
  let hasAnchor = wrist.x.isFinite && wrist.y.isFinite
  let anchor = hasAnchor ? wrist + s.offset : s.centre
  let pred = s.centre + s.velocity
  let lost = s.lost > 0
  let g = lost ? linspace(-1.0, 1.0, 21) : linspace(-0.4, 0.4, 17)
  var cands: [Point] = []
  for p in lost ? [anchor] : (hasAnchor ? [pred, anchor] : [pred]) {
    for dx in g { for dy in g { cands.append(p + Point(dx * M, dy * M)) } }
  }
  let majors = [0.9, 1.0, 1.1].map { $0 * M }
  let G = gradient(gray, around: cands, reach: 0.6 * majors.last!)
  let m = plateMask(img, around: cands, reach: 0.7 * majors.last!)
  let gate = (lost ? 1.2 : 0.6) * M
  func leashed(_ c: Point) -> Bool { !hasAnchor || norm(c - wrist) < norm(s.home) + 0.6 * M }
  func accepted(_ c: Point) -> Bool {
    let near = (!hasAnchor || norm(c - anchor) < gate || (!lost && norm(c - pred) < 0.3 * M))
    let side = s.side == 0 || !hasAnchor || (c.x - wrist.x) * s.side > 0
    return near && side && leashed(c)
  }
  var det: Plate?
  if let p = searchPlate(m, G, cands, majors, [0.9, 1.0, 1.1].map { min($0 * s.ratio, 1.0) }), p.score >= 0.55, accepted(p.centre) { det = p }
  var flow: Point?
  if !lost, let prev = s.prev, s.features.count >= 6 {
    let (x0, y0, x1, y1) = box(around: s.centre, half: 1.5 * M, gray)
    if x1 - x0 > 8, y1 - y0 > 8 {
      let a = crop(prev, x0, y0, x1, y1), b = crop(gray, x0, y0, x1, y1)
      let p0 = s.features.map { ($0.0 - Float(x0), $0.1 - Float(y0)) }
      let (p1, st) = opticalFlowPyrLK(a, b, p0, winSize: 21, maxLevel: 3)
      let (pb, st2) = opticalFlowPyrLK(b, a, p1, winSize: 21, maxLevel: 3)
      var dx: [Double] = [], dy: [Double] = [], kept: [(Float, Float)] = []
      for i in 0 ..< p0.count where st[i] && st2[i] && hypot(pb[i].0 - p0[i].0, pb[i].1 - p0[i].1) < 1 {
        dx.append(Double(p1[i].0 - p0[i].0))
        dy.append(Double(p1[i].1 - p0[i].1))
        kept.append((p1[i].0 + Float(x0), p1[i].1 + Float(y0)))
      }
      if kept.count >= 6, s.flowRun < 10, leashed(s.centre + Point(middle(dx), middle(dy))) {
        flow = s.centre + Point(middle(dx), middle(dy))
        s.features = kept
      } else {
        s.features = []
      }
    }
  }
  let src: Int
  let next: Point
  if let d = det, flow == nil || d.score >= 0.65 || norm(d.centre - flow!) < 0.15 * M {
    next = d.centre
    src = 1
    s.flowRun = 0
    s.major = 0.8 * M + 0.2 * d.axes.0
  } else if let f = flow {
    next = f
    src = 2
    s.flowRun += 1
  } else {
    s.lost += 1
    s.features = []
    s.centre = hasAnchor ? anchor : pred
    s.velocity = s.velocity * 0.8
    return 0
  }
  s.velocity = lost ? Point(0, 0) : next - s.centre
  s.centre = next
  s.lost = 0
  if src == 1 {
    if hasAnchor { s.offset = next - wrist }
    s.features = discFeatures(gray, next, s.major)
  }
  return src
}

func discFeatures(_ gray: GrayImage, _ c: Point, _ M: Double) -> [(Float, Float)] {
  let (x0, y0, x1, y1) = box(around: c, half: 0.45 * M, gray)
  guard x1 - x0 > 4, y1 - y0 > 4 else { return [] }
  let w = x1 - x0, r = 0.42 * M
  var mask = [UInt8](repeating: 0, count: w * (y1 - y0))
  for y in y0 ..< y1 { for x in x0 ..< x1 where hypot(Double(x) - c.x, Double(y) - c.y) <= r { mask[(y - y0) * w + x - x0] = 255 } }
  return goodFeaturesToTrack(crop(gray, x0, y0, x1, y1), maxCorners: 60, qualityLevel: 0.01, minDistance: 4, mask: mask)
    .map { ($0.0 + Float(x0), $0.1 + Float(y0)) }
}

private func searchPlate(_ m: RoiMask, _ G: Gradient, _ centres: [Point], _ majors: [Double], _ ratios: [Double]) -> Plate? {
  var best: Plate?
  for M in majors {
    for q in ratios {
      let offs = ellipseOffsets(M, q)
      let scores = parallelMap(centres.count) { i -> Double in
        let r = rimSupport(G, centres[i], M, q)
        return r.inside < 0.5 ? -1 : r.rim + 0.25 * max(0, fillScore(m, centres[i], offs))
      }
      for (c, v) in zip(centres, scores) where v > (best?.score ?? -1) {
        best = Plate(centre: c, axes: (M, M * q), score: v, side: "near", fitInliers: nil)
      }
    }
  }
  guard let p = best else { return nil }
  let M = p.axes.0, q = p.axes.1 / M
  let offs = ellipseOffsets(M, q)
  let fine = linspace(-0.05, 0.05, 11).flatMap { dy in linspace(-0.05, 0.05, 11).map { dx in p.centre + Point(dx * M, dy * M) } }
  let scores = fine.map { c -> Double in
    let r = rimSupport(G, c, M, q)
    return r.inside < 0.5 ? -1 : r.rim + 0.25 * max(0, fillScore(m, c, offs))
  }
  let top = scores.max()!
  var sum = Point(0, 0), n = 0.0
  for (c, v) in zip(fine, scores) where v >= top - 0.01 { sum += c; n += 1 }
  var out = p
  out.centre = sum / n
  out.score = max(p.score, top)
  return out
}

private struct Gradient {
  let x0: Int, y0: Int, width: Int, height: Int
  let gx: [Float], gy: [Float]
  let threshold: Float

  @inline(__always) func at(_ x: Int, _ y: Int) -> (Float, Float)? {
    guard x >= x0, y >= y0, x < x0 + width, y < y0 + height else { return nil }
    let i = (y - y0) * width + x - x0
    return (gx[i], gy[i])
  }
}

private let rimDirs: [(Double, Double)] = linspace(0, 2 * Double.pi, 72, endpoint: false).map { (cos($0), sin($0)) }

func plateFit(_ gray: GrayImage, _ c: Point, _ major: Double, _ ratio: Double) -> (rim: Double, polarity: Double, interior: Double) {
  let r = rimSupport(gradient(gray, around: [c], reach: 0.6 * major), c, major, ratio)
  let (x0, y0, x1, y1) = box(around: c, half: 0.3 * major, gray)
  var sum = 0.0, n = 0.0
  for y in y0 ..< y1 { for x in x0 ..< x1 where hypot(Double(x) - c.x, Double(y) - c.y) <= 0.3 * major { sum += Double(gray.data[y * gray.width + x]); n += 1 } }
  return r.inside < 0.5 ? (0, 0, .nan) : (r.rim, r.polarity, n > 0 ? sum / n : .nan)
}

private func rimSupport(_ G: Gradient, _ c: Point, _ major: Double, _ ratio: Double) -> (rim: Double, inside: Double, polarity: Double) {
  let b = major / 2, a = b * ratio
  guard a > 0, b > 0, c.x.isFinite, c.y.isFinite else { return (0, 0, 0) }
  var hit = 0, ok = 0, out = 0
  let thr = Double(G.threshold)
  for (ct, st) in rimDirs {
    var nx = ct / a, ny = st / b
    let nl = (nx * nx + ny * ny).squareRoot()
    nx /= nl
    ny /= nl
    var seen = false, on = false
    for r in [0.94, 1.0, 1.06] {
      guard let (gx, gy) = G.at(Int((c.x + r * a * ct).rounded()), Int((c.y + r * b * st).rounded())) else { continue }
      seen = true
      let v = Double(gx) * nx + Double(gy) * ny
      if abs(v) > thr { on = true; if v > 0 { out += 1 }; break }
    }
    if seen { ok += 1; if on { hit += 1 } }
  }
  return (ok > 0 ? Double(hit) / Double(ok) : 0, Double(ok) / Double(rimDirs.count), hit > 0 ? abs(Double(2 * out - hit)) / Double(hit) : 0)
}

private func gradient(_ g: GrayImage, around points: [Point], reach: Double) -> Gradient {
  var lo = Point(Double.infinity, Double.infinity), hi = -lo
  for p in points where p.x.isFinite && p.y.isFinite { lo = pointwiseMin(lo, p); hi = pointwiseMax(hi, p) }
  guard lo.x.isFinite, reach.isFinite else { return Gradient(x0: 0, y0: 0, width: 0, height: 0, gx: [], gy: [], threshold: 0) }
  let x0 = max(0, Int(lo.x - reach) - 2), y0 = max(0, Int(lo.y - reach) - 2)
  let x1 = min(g.width, Int(hi.x + reach) + 3), y1 = min(g.height, Int(hi.y + reach) + 3)
  let w = x1 - x0, h = y1 - y0
  guard w > 2, h > 2 else { return Gradient(x0: 0, y0: 0, width: 0, height: 0, gx: [], gy: [], threshold: 0) }
  let k: [Float] = (-4 ... 4).map { Float(exp(-Double($0 * $0) / 8)) }
  let ks = k.reduce(0, +)
  var tmp = [Float](repeating: 0, count: w * h), sm = tmp
  g.data.withUnsafeBufferPointer { src in
    tmp.withUnsafeMutableBufferPointer { t in
      parallelRows(h) { y in
        for x in 0 ..< w {
          var v: Float = 0
          for (j, kv) in k.enumerated() { v += kv * Float(src[(y0 + y) * g.width + min(max(x0 + x + j - 4, 0), g.width - 1)]) }
          t[y * w + x] = v / ks
        }
      }
    }
  }
  tmp.withUnsafeBufferPointer { t in
    sm.withUnsafeMutableBufferPointer { o in
      parallelRows(h) { y in
        for x in 0 ..< w {
          var v: Float = 0
          for (j, kv) in k.enumerated() { v += kv * t[min(max(y + j - 4, 0), h - 1) * w + x] }
          o[y * w + x] = v / ks
        }
      }
    }
  }
  var gx = [Float](repeating: 0, count: w * h), gy = gx
  var hist = [Int](repeating: 0, count: 256)
  for y in 1 ..< h - 1 {
    for x in 1 ..< w - 1 {
      let i = y * w + x
      let a = sm[i - w - 1], b = sm[i - w], c = sm[i - w + 1], d = sm[i - 1], e = sm[i + 1], f = sm[i + w - 1], gg = sm[i + w], hh = sm[i + w + 1]
      let vx = (c + 2 * e + hh) - (a + 2 * d + f), vy = (f + 2 * gg + hh) - (a + 2 * b + c)
      gx[i] = vx
      gy[i] = vy
      hist[min(255, Int((vx * vx + vy * vy).squareRoot() / 4))] += 1
    }
  }
  let target = Int(0.85 * Double((w - 2) * (h - 2)))
  var acc = 0, bin = 255
  for (i, c) in hist.enumerated() { acc += c; if acc >= target { bin = i; break } }
  return Gradient(x0: x0, y0: y0, width: w, height: h, gx: gx, gy: gy, threshold: max(Float(bin + 1) * 4, 8))
}

private func box(around c: Point, half: Double, _ g: GrayImage) -> (Int, Int, Int, Int) {
  guard c.x.isFinite, c.y.isFinite else { return (0, 0, 0, 0) }
  return (max(0, Int(c.x - half)), max(0, Int(c.y - half)), min(g.width, Int(c.x + half) + 1), min(g.height, Int(c.y + half) + 1))
}

private func crop(_ g: GrayImage, _ x0: Int, _ y0: Int, _ x1: Int, _ y1: Int) -> GrayImage {
  var d = [UInt8]()
  d.reserveCapacity((x1 - x0) * (y1 - y0))
  for y in y0 ..< y1 { d.append(contentsOf: g.data[(y * g.width + x0) ..< (y * g.width + x1)]) }
  return GrayImage(width: x1 - x0, height: y1 - y0, data: d)
}

private func norm(_ p: Point) -> Double { (p.x * p.x + p.y * p.y).squareRoot() }

private func middle(_ v: [Double]) -> Double {
  let s = v.sorted()
  return s.count % 2 == 1 ? s[s.count / 2] : (s[s.count / 2 - 1] + s[s.count / 2]) / 2
}

// MARK: - plate_mask

// The plate mask over one region of the frame, equal to cv2's full-frame mask inside [x0, x1) x [y0, y1).
struct RoiMask {
  let frameWidth: Int, frameHeight: Int
  let x0: Int, y0: Int, x1: Int, y1: Int  // the region the mask is valid on
  let ox: Int, oy: Int, width: Int, height: Int  // the computed (grown) region
  var data: [UInt8]

  @inline(__always) func at(_ x: Int, _ y: Int) -> UInt8 {
    precondition(x >= x0 && x < x1 && y >= y0 && y < y1, "mask sampled outside its region")
    return data[(y - oy) * width + (x - ox)]
  }
}

// closing with an 11x11 ellipse then opening with a 7x7 one: a pixel depends on sources within this many px
private let morphReach = 16

// The mask wherever a search around `points` can sample it (`reach` px around each), or the whole frame.
func plateMask(_ img: BGRImage, around points: [Point], reach: Double) -> RoiMask {
  var lo = Point(Double.infinity, Double.infinity), hi = -lo
  for p in points where p.x.isFinite && p.y.isFinite { lo = pointwiseMin(lo, p); hi = pointwiseMax(hi, p) }
  if !lo.x.isFinite || !reach.isFinite {
    return plateMask(img, x0: 0, y0: 0, x1: img.width, y1: img.height)
  }
  let x0 = max(0, Int((lo.x - reach).rounded(.down)) - 1), y0 = max(0, Int((lo.y - reach).rounded(.down)) - 1)
  let x1 = min(img.width, Int((hi.x + reach).rounded(.up)) + 2), y1 = min(img.height, Int((hi.y + reach).rounded(.up)) + 2)
  return plateMask(img, x0: x0, y0: y0, x1: x1, y1: y1)
}

// cv2.cvtColor(BGR2HSV) on 8-bit (H in 0..179), then dark (V < 75) or green (35 < H < 90, S > 90, V > 40),
// closed with an 11x11 ellipse and opened with a 7x7 one.
func plateMask(_ img: BGRImage, x0: Int, y0: Int, x1: Int, y1: Int) -> RoiMask {
  let (x0, y0, x1, y1) = (max(0, min(x0, img.width)), max(0, min(y0, img.height)), max(0, min(x1, img.width)), max(0, min(y1, img.height)))
  let gx0 = max(0, x0 - morphReach), gy0 = max(0, y0 - morphReach)
  let gx1 = min(img.width, x1 + morphReach), gy1 = min(img.height, y1 + morphReach)
  let w = max(0, gx1 - gx0), h = max(0, gy1 - gy0)
  var m = [UInt8](repeating: 0, count: w * h)
  img.data.withUnsafeBufferPointer { s in
    m.withUnsafeMutableBufferPointer { d in
      parallelRows(h) { y in
        for x in 0 ..< w {
          let i = ((gy0 + y) * img.width + gx0 + x) * 3
          let b = Int(s[i]), g = Int(s[i + 1]), r = Int(s[i + 2])
          let v = max(b, g, r), vmin = min(b, g, r)
          let o = y * w + x
          if v < 75 { d[o] = 255; continue }
          let diff = v - vmin
          let sat = (diff * hsvSdiv[v] + 2048) >> 12
          if sat <= 90 { continue }
          let vr = v == r ? -1 : 0, vg = v == g ? -1 : 0
          var hue = (vr & (g - b)) + (~vr & ((vg & (b - r + 2 * diff)) + (~vg & (r - g + 4 * diff))))
          hue = (hue * hsvHdiv[diff] + 2048) >> 12
          if hue < 0 { hue += 180 }
          if hue > 35 && hue < 90 { d[o] = 255 }
        }
      }
    }
  }
  var mask = Mask(width: w, height: h, data: m)
  mask = morph(mask, ellipseKernel(11), dilateFirst: true)
  mask = morph(mask, ellipseKernel(7), dilateFirst: false)
  return RoiMask(frameWidth: img.width, frameHeight: img.height, x0: x0, y0: y0, x1: x1, y1: y1, ox: gx0, oy: gy0, width: w, height: h, data: mask.data)
}

private let hsvSdiv: [Int] = (0 ..< 256).map { $0 == 0 ? 0 : Int((Double(255 << 12) / Double($0)).rounded(.toNearestOrEven)) }
private let hsvHdiv: [Int] = (0 ..< 256).map { $0 == 0 ? 0 : Int((Double(180 << 12) / (6 * Double($0))).rounded(.toNearestOrEven)) }

// cv2.getStructuringElement(MORPH_ELLIPSE, (k, k)) as the half-width of each row, top to bottom.
private func ellipseKernel(_ k: Int) -> [Int] {
  let r = k / 2
  return (0 ..< k).map { i in
    let dy = i - r
    return Int((Double(r) * ((Double(r * r - dy * dy)) * (1.0 / Double(r * r))).squareRoot()).rounded(.toNearestOrEven))
  }
}

// cv2.morphologyEx CLOSE (dilate then erode) or OPEN with a row-symmetric kernel; pixels outside the
// image never count (cv2's default border: the neutral element).
private func morph(_ m: Mask, _ halfWidths: [Int], dilateFirst: Bool) -> Mask {
  let a = morphPass(m, halfWidths, dilate: dilateFirst)
  return morphPass(a, halfWidths, dilate: !dilateFirst)
}

private func morphPass(_ m: Mask, _ halfWidths: [Int], dilate: Bool) -> Mask {
  let W = m.width, H = m.height, r = halfWidths.count / 2
  if W == 0 || H == 0 { return m }
  // horizontal pass per distinct half-width: a window count on each row's prefix sums
  let widths = Array(Set(halfWidths)).sorted()
  var rows: [Int: [UInt8]] = [:]
  for dx in widths {
    var out = [UInt8](repeating: 0, count: W * H)
    m.data.withUnsafeBufferPointer { src in
      out.withUnsafeMutableBufferPointer { o in
        parallelRows(H) { y in
          var prefix = [Int32](repeating: 0, count: W + 1)
          let base = y * W
          for x in 0 ..< W { prefix[x + 1] = prefix[x] + (src[base + x] > 0 ? 1 : 0) }
          for x in 0 ..< W {
            let lo = max(0, x - dx), hi = min(W - 1, x + dx)
            let c = prefix[hi + 1] - prefix[lo]
            o[base + x] = dilate ? (c > 0 ? 255 : 0) : (c == Int32(hi - lo + 1) ? 255 : 0)
          }
        }
      }
    }
    rows[dx] = out
  }
  let planes = halfWidths.map { rows[$0]! }
  var out = [UInt8](repeating: dilate ? 0 : 255, count: W * H)
  out.withUnsafeMutableBufferPointer { o in
    parallelRows(H) { y in
      for i in 0 ..< halfWidths.count {
        let yy = y + i - r
        if yy < 0 || yy >= H { continue }
        planes[i].withUnsafeBufferPointer { src in
          let s = yy * W, d = y * W
          if dilate {
            for x in 0 ..< W where src[s + x] != 0 { o[d + x] = 255 }
          } else {
            for x in 0 ..< W where src[s + x] == 0 { o[d + x] = 0 }
          }
        }
      }
    }
  }
  return Mask(width: W, height: H, data: out)
}

// MARK: - refine_plate

func refinePlate(_ img: BGRImage, _ plate: Plate) throws -> Plate? {
  var best: Plate?
  for kf in [0.6, 0.35] {
    if let f = refineOnce(img, plate, kf: kf), best == nil || f.fitInliers! > best!.fitInliers! { best = f }
  }
  return best
}

private func refineOnce(_ img: BGRImage, _ plate: Plate, kf: Double) -> Plate? {
  let r = plate.axes.1 / 2
  let k = max(5, Int(kf * r) | 1)
  let c = plate.centre
  guard c.x.isFinite, c.y.isFinite, r.isFinite, plate.axes.0.isFinite else { return nil }
  let R = Int(1.4 * plate.axes.0 / 2)
  let cx = Int(c.x), cy = Int(c.y)
  let x0 = max(0, cx - R - k), y0 = max(0, cy - R - k)
  let x1 = min(img.width, cx + R + k + 1), y1 = min(img.height, cy + R + k + 1)
  guard x1 > x0, y1 > y0 else { return nil }
  let rm = plateMask(img, x0: x0, y0: y0, x1: x1, y1: y1)
  var crop = Mask(width: x1 - x0, height: y1 - y0, data: [])
  crop.data.reserveCapacity(crop.width * crop.height)
  for y in y0 ..< y1 { crop.data.append(contentsOf: rm.data[((y - rm.oy) * rm.width + x0 - rm.ox) ..< ((y - rm.oy) * rm.width + x1 - rm.ox)]) }
  crop = morph(crop, ellipseKernel(k), dilateFirst: false)
  let roi = filledCircle(width: crop.width, height: crop.height, cx: cx - x0, cy: cy - y0, radius: R)
  for i in 0 ..< crop.data.count { crop.data[i] &= roi[i] }
  let contours = externalContours(crop)
  if contours.isEmpty { return nil }
  let pt = SIMD2<Float>(Float(c.x), Float(c.y))
  var pts: [SIMD2<Int>] = []
  var bestD = -Double.infinity
  for q in contours {
    let shifted = q.map { $0 &+ SIMD2(x0, y0) }
    let d = pointPolygonDistance(shifted, pt)
    if d > bestD { bestD = d; pts = shifted }
  }
  if pts.count < 20 { return nil }
  let ptsf = pts.map { SIMD2<Float>(Float($0.x), Float($0.y)) }
  let ptsd = pts.map { Point(Double($0.x), Double($0.y)) }
  var rng = PCG64()
  var best: EllipseFit?
  var bestIn = 0
  let tol = 0.035
  // the samples are drawn in order (one RNG stream); the fits are independent
  let samples = (0 ..< 300).map { _ in rng.choice(pts.count, 6) }
  let fits: [(EllipseFit, Int)?] = parallelMap(samples.count) { i in
    let e = fitEllipse(samples[i].map { ptsf[$0] })
    let (w, h) = (Double(e.width), Double(e.height))
    guard 0.5 * r < min(w, h) / 2, max(w, h) / 2 < 2.0 * r,
          hypot(Double(e.cx) - c.x, Double(e.cy) - c.y) <= r else { return nil }
    return (e, ellipseResiduals(ptsd, e).reduce(0) { $0 + ($1 < tol ? 1 : 0) })
  }
  for case let (e, nIn)? in fits where nIn > bestIn { best = e; bestIn = nIn }
  guard let b = best, Double(bestIn) >= 0.4 * Double(pts.count) else { return nil }
  let res = ellipseResiduals(ptsd, b)
  let inl = (0 ..< pts.count).filter { res[$0] < tol }.map { ptsf[$0] }
  let e = fitEllipse(inl)
  let t = Double(e.angle) * (Double.pi / 180)
  let a = Double(e.width) / 2, bb = Double(e.height) / 2
  let halfW = ((a * cos(t)) * (a * cos(t)) + (bb * sin(t)) * (bb * sin(t))).squareRoot()
  let halfH = ((a * sin(t)) * (a * sin(t)) + (bb * cos(t)) * (bb * cos(t))).squareRoot()
  var out = plate
  out.centre = Point(Double(e.cx), Double(e.cy))
  out.axes = (2 * halfH, 2 * halfW)
  out.fitInliers = Double(bestIn) / Double(pts.count)
  return out
}

// track.py ellipse_residual: |normalised radius - 1| against cv2's (centre, full axes, tilt) ellipse
private func ellipseResiduals(_ pts: [Point], _ e: EllipseFit) -> [Double] {
  let t = Double(e.angle) * (Double.pi / 180)
  let ct = cos(t), st = sin(t)
  let cx = Double(e.cx), cy = Double(e.cy), hw = Double(e.width) / 2, hh = Double(e.height) / 2
  return pts.map { p in
    let dx = p.x - cx, dy = p.y - cy
    let x = dx * ct + dy * st, y = -dx * st + dy * ct
    return abs(((x / hw) * (x / hw) + (y / hh) * (y / hh)).squareRoot() - 1)
  }
}

// cv2.circle(img, centre, radius, 255, -1): the midpoint circle with filled spans
private func filledCircle(width: Int, height: Int, cx: Int, cy: Int, radius: Int) -> [UInt8] {
  var img = [UInt8](repeating: 0, count: width * height)
  func hline(_ y: Int, _ xa: Int, _ xb: Int) {
    guard y >= 0, y < height else { return }
    let a = max(xa, 0), b = min(xb, width - 1)
    if a > b { return }
    for x in a ... b { img[y * width + x] = 255 }
  }
  var err = 0, dx = radius, dy = 0, plus = 1, minus = (radius << 1) - 1
  while dx >= dy {
    hline(cy - dy, cx - dx, cx + dx)
    hline(cy + dy, cx - dx, cx + dx)
    hline(cy - dx, cx - dy, cx + dy)
    hline(cy + dx, cx - dy, cx + dy)
    dy += 1
    err += plus
    plus += 2
    let mask = (err <= 0) ? 0 : -1
    err -= minus & mask
    dx += mask
    minus -= mask & 2
  }
  return img
}

// cv2.findContours(RETR_EXTERNAL, CHAIN_APPROX_NONE): Suzuki border following on a zero-padded copy,
// outer borders only, each as its pixel sequence.
private func externalContours(_ m: Mask) -> [[SIMD2<Int>]] {
  let W = m.width + 2, H = m.height + 2
  var img = [Int8](repeating: 0, count: W * H)
  for y in 0 ..< m.height { for x in 0 ..< m.width where m.data[y * m.width + x] != 0 { img[(y + 1) * W + x + 1] = 1 } }
  let deltas: [(Int, Int)] = [(1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1)]
  func delta(_ s: Int) -> Int { let d = deltas[s % 8]; return d.0 + d.1 * W }
  let nbd: Int8 = 2
  let right: Int8 = nbd | Int8(bitPattern: 0x80)
  var contours: [[SIMD2<Int>]] = []

  func fetch(_ start: Int) {
    var pts: [SIMD2<Int>] = []
    var pt = SIMD2(start % W - 1, start / W - 1)
    let i0 = start
    var s = 4
    var i1 = i0
    repeat {
      s = (s - 1) & 7
      i1 = i0 + delta(s)
    } while img[i1] == 0 && s != 4
    if s == 4 {
      img[i0] = right
      pts.append(pt)
    } else {
      var i3 = i0, i4 = i0
      while true {
        let sEnd = s
        s = min(s, 15)
        while s < 15 {
          s += 1
          i4 = i3 + delta(s)
          if img[i4] != 0 { break }
        }
        s &= 7
        if UInt(bitPattern: s - 1) < UInt(sEnd) {
          img[i3] = right
        } else if img[i3] == 1 {
          img[i3] = nbd
        }
        pts.append(pt)
        pt = pt &+ SIMD2(deltas[s].0, deltas[s].1)
        if i4 == i0 && i3 == i1 { break }
        i3 = i4
        s = (s + 4) & 7
      }
    }
    contours.append(pts)
  }

  var x = 1, y = 1
  var lnbd = SIMD2(0, 1)
  var prev = Int(img[y * W + x - 1])
  var lastPos = lnbd
  while y < H - 1 {
    var p = 0
    while x < W - 1 {
      while x < W - 1 {
        p = Int(img[y * W + x])
        if p != prev { break }
        x += 1
      }
      if x >= W - 1 { break }
      var isHole = false
      var traced = false
      if !(prev == 0 && p == 1) {
        if !(p != 0 || prev < 1) {
          if prev & 0xFE != 0 { lastPos.x = x - 1 }
          isHole = true
        } else {
          isHole = false
          prev = p
          if prev & 0xFE != 0 { lastPos.x = x }
          x += 1
          continue
        }
      }
      if !(isHole || img[lastPos.y * W + lastPos.x] > 0) {
        lastPos.x = x
        fetch(y * W + x)
        lnbd = lastPos
        traced = true
      }
      if traced {
        x += 1
        prev = Int(img[y * W + x - 1])
        lastPos = lnbd
      } else {
        prev = p
        if prev & 0xFE != 0 { lastPos.x = x }
        x += 1
      }
    }
    lastPos = SIMD2(0, y + 1)
    x = 1
    prev = 0
    y += 1
  }
  return contours
}

// cv2.pointPolygonTest(contour, pt, True): signed distance to the closed polygon, positive inside
private func pointPolygonDistance(_ cnt: [SIMD2<Int>], _ pt: SIMD2<Float>) -> Double {
  var minNum = Double(Float.greatestFiniteMagnitude), minDen = 1.0
  var counter = 0
  var v = SIMD2<Float>(Float(cnt[cnt.count - 1].x), Float(cnt[cnt.count - 1].y))
  for q in cnt {
    let v0 = v
    v = SIMD2<Float>(Float(q.x), Float(q.y))
    let dx = Double(v.x - v0.x), dy = Double(v.y - v0.y)
    let dx1 = Double(pt.x - v0.x), dy1 = Double(pt.y - v0.y)
    let dx2 = Double(pt.x - v.x), dy2 = Double(pt.y - v.y)
    var num: Double, den = 1.0
    if dx1 * dx + dy1 * dy <= 0 {
      num = dx1 * dx1 + dy1 * dy1
    } else if dx2 * dx + dy2 * dy >= 0 {
      num = dx2 * dx2 + dy2 * dy2
    } else {
      num = dy1 * dx - dx1 * dy
      num *= num
      den = dx * dx + dy * dy
    }
    if num * minDen < minNum * den {
      minNum = num
      minDen = den
      if minNum == 0 { break }
    }
    if (v0.y <= pt.y && v.y <= pt.y) || (v0.y > pt.y && v.y > pt.y) || (v0.x < pt.x && v.x < pt.x) { continue }
    var d = dy1 * dx - dx1 * dy
    if dy < 0 { d = -d }
    if d > 0 { counter += 1 }
  }
  let result = (minNum / minDen).squareRoot()
  return counter % 2 == 0 ? -result : result
}

// MARK: - cv2.fitEllipse (fitEllipseNoDirect, float32 in and out)

struct EllipseFit {
  var cx: Float, cy: Float, width: Float, height: Float, angle: Float
}

private func fitEllipse(_ pts: [SIMD2<Float>]) -> EllipseFit {
  let n = pts.count
  var c = SIMD2<Float>(0, 0)
  for p in pts { c += p }
  c.x /= Float(n)
  c.y /= Float(n)
  var s = 0.0
  for p in pts { let d = p - c; s += Double(abs(d.x)) + Double(abs(d.y)) }
  let scale = 100.0 / (s > Double(Float.ulpOfOne) ? s : Double(Float.ulpOfOne))
  var A = [Double](repeating: 0, count: n * 5)
  var b = [Double](repeating: 10000.0, count: n)
  var ptsc = pts
  func fillA() {
    for (i, p) in ptsc.enumerated() {
      let d = p - c
      let px = Double(d.x) * scale, py = Double(d.y) * scale
      A[i * 5] = -px * px
      A[i * 5 + 1] = -py * py
      A[i * 5 + 2] = -px * py
      A[i * 5 + 3] = px
      A[i * 5 + 4] = py
    }
  }
  fillA()
  var (gfp, w) = svdSolve(A, rows: n, cols: 5, b)
  if w[0] * Double(Float.ulpOfOne) > w[4] {
    // cv2 jitters the points with its global RNG here; a degenerate sample, not reproducible
    let eps = Float(s / Double(n * 2) * 1e-3)
    var r = SystemRandomNumberGenerator()
    for i in 0 ..< n { ptsc[i] += SIMD2(Float.random(in: -eps ... eps, using: &r), Float.random(in: -eps ... eps, using: &r)) }
    fillA()
    (gfp, w) = svdSolve(A, rows: n, cols: 5, b)
  }
  let A2 = [2 * gfp[0], gfp[2], gfp[2], 2 * gfp[1]]
  let rp = svdSolve(A2, rows: 2, cols: 2, [gfp[3], gfp[4]]).0
  var A3 = [Double](repeating: 0, count: n * 3)
  b = [Double](repeating: 1.0, count: n)
  for (i, p) in ptsc.enumerated() {
    let d = p - c
    let px = Double(d.x) * scale, py = Double(d.y) * scale
    A3[i * 3] = (px - rp[0]) * (px - rp[0])
    A3[i * 3 + 1] = (py - rp[1]) * (py - rp[1])
    A3[i * 3 + 2] = (px - rp[0]) * (py - rp[1])
  }
  let g = svdSolve(A3, rows: n, cols: 3, b).0
  let ang = -0.5 * atan2(g[2], g[1] - g[0])
  let t = abs(g[2]) > 1e-8 ? g[2] / sin(-2.0 * ang) : g[1] - g[0]
  var r2 = abs(g[0] + g[1] - t)
  if r2 > 1e-8 { r2 = (2.0 / r2).squareRoot() }
  var r3 = abs(g[0] + g[1] + t)
  if r3 > 1e-8 { r3 = (2.0 / r3).squareRoot() }
  var e = EllipseFit(cx: Float(rp[0] / scale) + c.x, cy: Float(rp[1] / scale) + c.y,
                     width: Float(r2 * 2 / scale), height: Float(r3 * 2 / scale), angle: 0)
  if e.width > e.height {
    swap(&e.width, &e.height)
    e.angle = Float(90 + ang * 180 / Double.pi)
  }
  if e.angle < -180 { e.angle += 360 }
  if e.angle > 360 { e.angle -= 360 }
  return e
}

// cv::solve(DECOMP_SVD): x = sum over singular values above 2 eps * sum(w) of v_i (u_i . b) / w_i.
// A is row-major rows x cols; returns x and the singular values.
private func svdSolve(_ A: [Double], rows: Int, cols: Int, _ b: [Double]) -> ([Double], [Double]) {
  var m = __CLPK_integer(rows), n = __CLPK_integer(cols)
  var a = [Double](repeating: 0, count: rows * cols)
  for i in 0 ..< rows { for j in 0 ..< cols { a[j * rows + i] = A[i * cols + j] } }
  let k = min(rows, cols)
  var w = [Double](repeating: 0, count: k)
  var u = [Double](repeating: 0, count: rows * k)
  var vt = [Double](repeating: 0, count: cols * cols)
  var lda = m, ldu = m, ldvt = n
  var info: __CLPK_integer = 0
  var lwork: __CLPK_integer = -1
  var query = 0.0
  var jobu = Int8(UInt8(ascii: "S")), jobvt = Int8(UInt8(ascii: "A"))
  dgesvd_(&jobu, &jobvt, &m, &n, &a, &lda, &w, &u, &ldu, &vt, &ldvt, &query, &lwork, &info)
  lwork = __CLPK_integer(query)
  var work = [Double](repeating: 0, count: Int(lwork))
  dgesvd_(&jobu, &jobvt, &m, &n, &a, &lda, &w, &u, &ldu, &vt, &ldvt, &work, &lwork, &info)
  var x = [Double](repeating: 0, count: cols)
  var threshold = 0.0
  for i in 0 ..< k { threshold += w[i] }
  threshold *= Double.ulpOfOne * 2
  for i in 0 ..< k {
    if abs(w[i]) <= threshold { continue }
    var s = 0.0
    for j in 0 ..< rows { s += u[i * rows + j] * b[j] }
    s *= 1 / w[i]
    for j in 0 ..< cols { x[j] += s * vt[j * cols + i] }
  }
  return (x, w)
}

// MARK: - numpy.random.default_rng(0).choice(n, 6, replace=False)

// PCG64 (XSL-RR 128/64) at the state numpy's default_rng(0) starts from, with Generator.choice's
// Floyd sampling and tail shuffle, so the RANSAC draws the same samples as the Python reference.
struct PCG64 {
  private var hi: UInt64 = 0x1aa1_b534_5996_452d
  private var lo: UInt64 = 0x0958_5eb7_a695_61e3
  private let incHi: UInt64 = 0x418d_dadb_3af7_1a82
  private let incLo: UInt64 = 0x5881_33bc_4478_73a9
  private var hasUint32 = false
  private var uinteger: UInt32 = 0

  mutating func next64() -> UInt64 {
    let mh: UInt64 = 2_549_297_995_355_413_924, ml: UInt64 = 4_865_540_595_714_422_341
    let (h1, l1) = lo.multipliedFullWidth(by: ml)
    var nh = h1 &+ hi &* ml &+ lo &* mh
    var nl = l1
    let (sl, carry) = nl.addingReportingOverflow(incLo)
    nl = sl
    nh = nh &+ incHi &+ (carry ? 1 : 0)
    hi = nh
    lo = nl
    let rot = UInt64(hi >> 58)
    let x = hi ^ lo
    return rot == 0 ? x : (x >> rot) | (x << (64 - rot))
  }

  mutating func next32() -> UInt32 {
    if hasUint32 { hasUint32 = false; return uinteger }
    let n = next64()
    hasUint32 = true
    uinteger = UInt32(truncatingIfNeeded: n >> 32)
    return UInt32(truncatingIfNeeded: n)
  }

  // random_bounded_uint64(off 0, rng, masked false) for rng < 2^32 - 1: Lemire's method
  mutating func bounded(_ rng: UInt32) -> Int {
    if rng == 0 { return 0 }
    let excl = UInt64(rng) + 1
    var m = UInt64(next32()) * excl
    var leftover = m & 0xFFFF_FFFF
    if leftover < excl {
      let threshold = UInt64((UInt32.max - rng) % UInt32(excl))
      while leftover < threshold {
        m = UInt64(next32()) * excl
        leftover = m & 0xFFFF_FFFF
      }
    }
    return Int(m >> 32)
  }

  mutating func choice(_ pop: Int, _ size: Int) -> [Int] {
    var mask = Int(1.2 * Double(size))
    mask |= mask >> 1; mask |= mask >> 2; mask |= mask >> 4; mask |= mask >> 8; mask |= mask >> 16; mask |= mask >> 32
    var hashSet = [Int](repeating: -1, count: mask + 1)
    var idx = [Int](repeating: 0, count: size)
    for j in (pop - size) ..< pop {
      let val = bounded(UInt32(j))
      var loc = val & mask
      while hashSet[loc] != -1 && hashSet[loc] != val { loc = (loc + 1) & mask }
      if hashSet[loc] == -1 {
        hashSet[loc] = val
        idx[j - pop + size] = val
      } else {
        loc = j & mask
        while hashSet[loc] != -1 { loc = (loc + 1) & mask }
        hashSet[loc] = j
        idx[j - pop + size] = j
      }
    }
    for i in stride(from: size - 1, through: 1, by: -1) {
      let j = bounded(UInt32(i))
      idx.swapAt(i, j)
    }
    return idx
  }
}
