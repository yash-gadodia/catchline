import Accelerate
import Foundation

// track.py foreground_mask, stabilise (one step) and camera_path (one step). Signatures in StageAPI.swift.
//
// The OpenCV calls those make (cvtColor, goodFeaturesToTrack, calcOpticalFlowPyrLK,
// estimateAffinePartial2D RANSAC) are reproduced step by step, in OpenCV's fixed-point
// arithmetic and with its RNG, so the phone gives the server's affines. No OpenCV, no Vision.

// cv2.cvtColor(BGR2GRAY) on uint8: (B*1868 + G*9617 + R*4899 + 2^13) >> 14
func grayscale(_ img: BGRImage) -> GrayImage {
  // (b * 1868 + g * 9617 + r * 4899 + 8192) >> 14 in float: every product and sum is an integer under 2^24, so exact
  let n = img.width * img.height
  var out = [UInt8](repeating: 0, count: n)
  var acc = [Float](repeating: 0, count: n), ch = acc
  var bias: Float = 8192, wb: Float = 1868, wg: Float = 9617, wr: Float = 4899, inv: Float = 1 / 16384
  img.data.withUnsafeBufferPointer { s in
    vDSP_vfltu8(s.baseAddress!, 3, &ch, 1, vDSP_Length(n))
    vDSP_vsmsa(ch, 1, &wb, &bias, &acc, 1, vDSP_Length(n))
    vDSP_vfltu8(s.baseAddress! + 1, 3, &ch, 1, vDSP_Length(n))
    vDSP_vsma(ch, 1, &wg, acc, 1, &acc, 1, vDSP_Length(n))
    vDSP_vfltu8(s.baseAddress! + 2, 3, &ch, 1, vDSP_Length(n))
    vDSP_vsma(ch, 1, &wr, acc, 1, &acc, 1, vDSP_Length(n))
  }
  vDSP_vsmul(acc, 1, &inv, &acc, 1, vDSP_Length(n))
  vDSP_vfixu8(acc, 1, &out, 1, vDSP_Length(n))  // truncation = the shift
  return GrayImage(width: img.width, height: img.height, data: out)
}

func foregroundMask(width: Int, height: Int, boxes: [Box], wrists: (Point, Point)?, scale: Double) throws -> Mask {
  guard width > 0, height > 0 else { throw StageError.invalid("empty mask") }
  var m = [UInt8](repeating: 0, count: width * height)
  for b in boxes {
    let pw = 0.15 * (b[2] - b[0]), ph = 0.08 * (b[3] - b[1])
    let x1 = max(Int(b[0] - pw), 0), y1 = max(Int(b[1] - ph), 0)
    let x2 = min(Int(b[2] + pw), width - 1), y2 = min(Int(b[3] + ph), height - 1)
    if x1 > x2 || y1 > y2 { continue }
    for y in y1 ... y2 { for x in x1 ... x2 { m[y * width + x] = 255 } }
  }
  if let (p, q) = wrists, p.x.isFinite, p.y.isFinite, q.x.isFinite, q.y.isFinite {
    // cv2.line: the thick segment through the int-truncated ends, no round caps
    let d = q - p
    let a = Point(Double(Int(p.x - 3 * d.x)), Double(Int(p.y - 3 * d.y)))
    let b = Point(Double(Int(q.x + 3 * d.x)), Double(Int(q.y + 3 * d.y)))
    let r = Double(Int(2 * scale) / 2)
    let e = b - a, len2 = e.x * e.x + e.y * e.y
    if len2 > 0 {
      let x0 = max(Int(min(a.x, b.x) - r) - 1, 0), x1 = min(Int(max(a.x, b.x) + r) + 1, width - 1)
      let y0 = max(Int(min(a.y, b.y) - r) - 1, 0), y1 = min(Int(max(a.y, b.y) + r) + 1, height - 1)
      if x0 <= x1, y0 <= y1 {
        for y in y0 ... y1 {
          for x in x0 ... x1 {
            let px = Double(x) - a.x, py = Double(y) - a.y
            let t = (px * e.x + py * e.y) / len2
            if t < 0 || t > 1 { continue }
            if abs(px * e.y - py * e.x) / len2.squareRoot() <= r { m[y * width + x] = 255 }
          }
        }
      }
    }
  }
  return Mask(width: width, height: height, data: m)
}

func cameraMotionStep(prev: GrayImage, cur: GrayImage, foreground: Mask, params: KLTParams) throws -> (affine: Affine, inliers: Int)? {
  guard prev.width == cur.width, prev.height == cur.height, foreground.width == prev.width, foreground.height == prev.height
  else { throw StageError.invalid("camera motion: frame and mask sizes differ") }
  let p0 = goodFeaturesToTrack(prev, maxCorners: params.maxCorners, qualityLevel: 0.01, minDistance: params.minDistance,
                               mask: foreground.data.map { $0 == 0 ? 255 : 0 })
  if p0.count < 12 { return nil }
  let (p1, st) = opticalFlowPyrLK(prev, cur, p0, winSize: params.winSize, maxLevel: params.maxLevel)
  var a = [(Float, Float)](), b = [(Float, Float)]()
  for i in 0 ..< p0.count where st[i] { a.append(p1[i]); b.append(p0[i]) }
  if a.count < 12 { return nil }
  return estimateAffinePartial2D(from: a, to: b, threshold: params.ransacThreshold)
}

func mulAffine(_ p: Affine, _ q: Affine) -> Affine {
  [p[0] * q[0] + p[1] * q[3], p[0] * q[1] + p[1] * q[4], p[0] * q[2] + p[1] * q[5] + p[2],
   p[3] * q[0] + p[4] * q[3], p[3] * q[1] + p[4] * q[4], p[3] * q[2] + p[4] * q[5] + p[5]]
}

// BORDER_REFLECT_101 index
@inline(__always) private func reflect(_ i: Int, _ n: Int) -> Int {
  if n == 1 { return 0 }
  var i = i
  while i < 0 || i >= n { i = i < 0 ? -i : 2 * n - 2 - i }
  return i
}

// cv2.goodFeaturesToTrack(img, maxCorners, qualityLevel, minDistance, mask) with the
// defaults (blockSize 3, Sobel 3, Shi-Tomasi). Returns integer pixel corners, strongest first.
func goodFeaturesToTrack(_ img: GrayImage, maxCorners: Int, qualityLevel: Double, minDistance: Double,
                         mask: [UInt8]?) -> [(Float, Float)] {
  let w = img.width, h = img.height
  if w < 3 || h < 3 { return [] }
  // cornerMinEigenVal: Sobel scaled by 1 / (2^(ksize-1) * blockSize * 255), 3x3 box sum of the products
  let scale: Float = 1 / (4 * 3 * 255)
  let xm = (0 ..< w).map { reflect($0 - 1, w) }, xp = (0 ..< w).map { reflect($0 + 1, w) }
  var dx = [Float](repeating: 0, count: w * h), dy = dx
  img.data.withUnsafeBufferPointer { p in
    dx.withUnsafeMutableBufferPointer { dxp in
      dy.withUnsafeMutableBufferPointer { dyp in
        DispatchQueue.concurrentPerform(iterations: h) { y in
          let rm = p.baseAddress! + reflect(y - 1, h) * w, r0 = p.baseAddress! + y * w, rp = p.baseAddress! + reflect(y + 1, h) * w
          let ox = dxp.baseAddress! + y * w, oy = dyp.baseAddress! + y * w
          for x in 0 ..< w {
            let l = xm[x], r = xp[x]
            let a = Int32(rm[l]), b = Int32(rm[x]), c = Int32(rm[r])
            let d = Int32(r0[l]), f = Int32(r0[r])
            let g = Int32(rp[l]), hh = Int32(rp[x]), i = Int32(rp[r])
            let right: Int32 = c + 2 * f + i, left: Int32 = a + 2 * d + g
            let down: Int32 = g + 2 * hh + i, up: Int32 = a + 2 * b + c
            ox[x] = Float(right - left) * scale
            oy[x] = Float(down - up) * scale
          }
        }
      }
    }
  }
  // 3x3 box sums of dx*dx, dx*dy, dy*dy, then the smaller eigenvalue, row by row
  var eig = [Float](repeating: 0, count: w * h)
  var rowMax = [Float](repeating: -.greatestFiniteMagnitude, count: h)
  dx.withUnsafeBufferPointer { dxp in
    dy.withUnsafeBufferPointer { dyp in
      eig.withUnsafeMutableBufferPointer { ep in
        rowMax.withUnsafeMutableBufferPointer { rmx in
          DispatchQueue.concurrentPerform(iterations: h) { y in
            let ys = [reflect(y - 1, h), y, reflect(y + 1, h)]
            let o = ep.baseAddress! + y * w
            var best: Float = -.greatestFiniteMagnitude
            for x in 0 ..< w {
              var sxx: Float = 0, sxy: Float = 0, syy: Float = 0
              for yy in ys {
                for xx in [xm[x], x, xp[x]] {
                  let gx = dxp[yy * w + xx], gy = dyp[yy * w + xx]
                  sxx += gx * gx; sxy += gx * gy; syy += gy * gy
                }
              }
              let a = sxx * 0.5, b = sxy, c = syy * 0.5
              let v = (a + c) - ((a - c) * (a - c) + b * b).squareRoot()
              o[x] = v
              if mask == nil || mask![y * w + x] != 0 { best = max(best, v) }
            }
            rmx[y] = best
          }
        }
      }
    }
  }
  let maxVal = rowMax.max()!
  let thresh = maxVal * Float(qualityLevel)
  for i in 0 ..< w * h where eig[i] <= thresh { eig[i] = 0 }
  // local maxima (3x3 dilate equality), 1 px in from the border, inside the mask
  var corners: [(Float, Int, Int)] = []
  for y in 1 ..< h - 1 {
    for x in 1 ..< w - 1 {
      let v = eig[y * w + x]
      if v == 0 || (mask != nil && mask![y * w + x] == 0) { continue }
      var isMax = true
      for yy in y - 1 ... y + 1 where isMax {
        for xx in x - 1 ... x + 1 where eig[yy * w + xx] > v { isMax = false; break }
      }
      if isMax { corners.append((v, x, y)) }
    }
  }
  corners.sort { $0.0 > $1.0 }
  var out: [(Float, Float)] = []
  if minDistance >= 1 {
    let cell = Int(minDistance.rounded()), gw = (w + cell - 1) / cell, gh = (h + cell - 1) / cell
    var grid = [[(Float, Float)]](repeating: [], count: gw * gh)
    let md2 = Float(minDistance * minDistance)
    for (_, x, y) in corners {
      let fx = Float(x), fy = Float(y)
      let cx = x / cell, cy = y / cell
      var good = true
      for yy in max(cy - 1, 0) ... min(cy + 1, gh - 1) where good {
        for xx in max(cx - 1, 0) ... min(cx + 1, gw - 1) where good {
          for (px, py) in grid[yy * gw + xx] where (fx - px) * (fx - px) + (fy - py) * (fy - py) < md2 { good = false; break }
        }
      }
      if good {
        grid[cy * gw + cx].append((fx, fy))
        out.append((fx, fy))
        if out.count >= maxCorners { break }
      }
    }
  } else {
    for (_, x, y) in corners.prefix(maxCorners) { out.append((Float(x), Float(y))) }
  }
  return out
}

// cv2.pyrDown for uint8: 5x5 [1 4 6 4 1] binomial, reflect-101 borders, (sum + 128) >> 8
func pyrDown(_ img: GrayImage) -> GrayImage {
  let w = img.width, h = img.height, ow = (w + 1) / 2, oh = (h + 1) / 2
  let k: [Int32] = [1, 4, 6, 4, 1]
  let xi = (0 ..< ow).flatMap { x in (0 ..< 5).map { reflect(2 * x + $0 - 2, w) } }
  let yi = (0 ..< oh).flatMap { y in (0 ..< 5).map { reflect(2 * y + $0 - 2, h) } }
  var rows = [Int32](repeating: 0, count: h * ow)
  var out = [UInt8](repeating: 0, count: ow * oh)
  img.data.withUnsafeBufferPointer { p in
    rows.withUnsafeMutableBufferPointer { r in
      for y in 0 ..< h {
        let src = p.baseAddress! + y * w, dst = r.baseAddress! + y * ow
        for x in 0 ..< ow {
          let i = x * 5
          dst[x] = Int32(src[xi[i]]) + 4 * Int32(src[xi[i + 1]]) + 6 * Int32(src[xi[i + 2]]) + 4 * Int32(src[xi[i + 3]]) + Int32(src[xi[i + 4]])
        }
      }
      out.withUnsafeMutableBufferPointer { o in
        for y in 0 ..< oh {
          let dst = o.baseAddress! + y * ow
          for x in 0 ..< ow {
            var s: Int32 = 0
            for j in 0 ..< 5 { s += k[j] * r[yi[y * 5 + j] * ow + x] }
            dst[x] = UInt8((s + 128) >> 8)
          }
        }
      }
    }
  }
  return GrayImage(width: ow, height: oh, data: out)
}

// One pyramid level as calcOpticalFlowPyrLK reads it: the image padded by the window
// (reflect-101) and, for the first image, its Scharr derivatives (dx, dy interleaved, zero outside).
private final class LKLevel {
  let w: Int, h: Int, pad: Int, stride: Int
  let img: UnsafeMutablePointer<UInt8>
  let deriv: UnsafeMutablePointer<Int16>?

  init(_ g: GrayImage, pad: Int, derivatives: Bool) {
    let w = g.width, h = g.height, stride = w + 2 * pad, ph = h + 2 * pad
    let img = UnsafeMutablePointer<UInt8>.allocate(capacity: stride * ph)
    g.data.withUnsafeBufferPointer { src in
      for y in 0 ..< ph {
        let row = src.baseAddress! + reflect(y - pad, h) * w, dst = img + y * stride
        (dst + pad).update(from: row, count: w)
        for x in 0 ..< pad { dst[x] = row[reflect(x - pad, w)]; dst[pad + w + x] = row[reflect(w + x, w)] }
      }
    }
    var deriv: UnsafeMutablePointer<Int16>?
    if derivatives {
      // calcScharrDeriv: dx = [-1 0 1] x [3 10 3]^T, dy = [3 10 3] x [-1 0 1]^T, reflect-101
      let d = UnsafeMutablePointer<Int16>.allocate(capacity: stride * ph * 2)
      d.initialize(repeating: 0, count: stride * ph * 2)
      let trow0 = UnsafeMutablePointer<Int32>.allocate(capacity: w), trow1 = UnsafeMutablePointer<Int32>.allocate(capacity: w)
      defer { trow0.deallocate(); trow1.deallocate() }
      g.data.withUnsafeBufferPointer { src in
        let p = src.baseAddress!
        for y in 0 ..< h {
          let r0 = p + reflect(y - 1, h) * w, r1 = p + y * w, r2 = p + reflect(y + 1, h) * w
          for x in 0 ..< w {
            trow0[x] = (Int32(r0[x]) + Int32(r2[x])) * 3 + Int32(r1[x]) * 10
            trow1[x] = Int32(r2[x]) - Int32(r0[x])
          }
          let o = d + ((y + pad) * stride + pad) * 2
          for x in 0 ..< w {
            let x0 = x > 0 ? x - 1 : (w > 1 ? 1 : 0), x1 = x < w - 1 ? x + 1 : (w > 1 ? w - 2 : 0)
            o[x * 2] = Int16(truncatingIfNeeded: trow0[x1] - trow0[x0])
            o[x * 2 + 1] = Int16(truncatingIfNeeded: (trow1[x1] + trow1[x0]) * 3 + trow1[x] * 10)
          }
        }
      }
      deriv = d
    }
    self.w = w; self.h = h; self.pad = pad; self.stride = stride
    self.img = img
    self.deriv = deriv
  }

  deinit {
    img.deallocate()
    deriv?.deallocate()
  }
}

@inline(__always) private func descale(_ v: Int32, _ n: Int32) -> Int32 { (v &+ (1 << (n - 1))) >> n }

// cv2.calcOpticalFlowPyrLK(prev, next, pts, None, winSize, maxLevel) with the default
// criteria (30 iterations, eps 0.01) and minEigThreshold 1e-4. Returns the tracked
// points and whether each was found. Points are independent, so they run in parallel.
func opticalFlowPyrLK(_ prev: GrayImage, _ next: GrayImage, _ pts: [(Float, Float)], winSize: Int, maxLevel: Int)
  -> (next: [(Float, Float)], status: [Bool]) {
  var pyrA = [prev], pyrB = [next]
  for _ in 0 ..< maxLevel { pyrA.append(pyrDown(pyrA.last!)); pyrB.append(pyrDown(pyrB.last!)) }
  let levelsA = pyrA.map { LKLevel($0, pad: winSize, derivatives: true) }
  let levelsB = pyrB.map { LKLevel($0, pad: winSize, derivatives: false) }
  let half = Float(winSize - 1) * 0.5
  let eps: Float = 0.01 * 0.01, fltScale: Float = 1 / Float(1 << 20)
  let wbits: Int32 = 14, one: Float = Float(1 << 14)
  let n = pts.count, chunk = 16, chunks = (n + chunk - 1) / chunk
  var out = pts, status = [Bool](repeating: true, count: n)
  for level in stride(from: maxLevel, through: 0, by: -1) {
    let I = levelsA[level], J = levelsB[level]
    let sc = 1 / Float(1 << level)
    let ip = I.img, dp = I.deriv!, jp = J.img, istride = I.stride, jstride = J.stride
    out.withUnsafeMutableBufferPointer { outp in
      status.withUnsafeMutableBufferPointer { stp in
        DispatchQueue.concurrentPerform(iterations: chunks) { c in
          let patchI = UnsafeMutablePointer<Int16>.allocate(capacity: winSize * winSize)
          let patchD = UnsafeMutablePointer<Int16>.allocate(capacity: winSize * winSize * 2)
          defer { patchI.deallocate(); patchD.deallocate() }
          for i in c * chunk ..< min((c + 1) * chunk, n) {
            var prevPt = (pts[i].0 * sc, pts[i].1 * sc)
            var nextPt = level == maxLevel ? prevPt : (outp[i].0 * 2, outp[i].1 * 2)
            outp[i] = nextPt
            prevPt = (prevPt.0 - half, prevPt.1 - half)
            let ipx = Int(prevPt.0.rounded(.down)), ipy = Int(prevPt.1.rounded(.down))
            if ipx < -winSize || ipx >= I.w || ipy < -winSize || ipy >= I.h {
              if level == 0 { stp[i] = false }
              continue
            }
            var a = prevPt.0 - Float(ipx), b = prevPt.1 - Float(ipy)
            var iw00 = Int32(((1 - a) * (1 - b) * one).rounded()), iw01 = Int32((a * (1 - b) * one).rounded())
            var iw10 = Int32(((1 - a) * b * one).rounded()), iw11 = (1 << wbits) - iw00 - iw01 - iw10
            var iA11: Int64 = 0, iA12: Int64 = 0, iA22: Int64 = 0
            for y in 0 ..< winSize {
              let s = ip + (y + ipy + I.pad) * istride + ipx + I.pad, s1 = s + istride
              let d = dp + ((y + ipy + I.pad) * istride + ipx + I.pad) * 2, d1 = d + istride * 2
              let pi = patchI + y * winSize, pd = patchD + y * winSize * 2
              for x in 0 ..< winSize {
                let ival = descale(Int32(s[x]) * iw00 + Int32(s[x + 1]) * iw01 + Int32(s1[x]) * iw10 + Int32(s1[x + 1]) * iw11, wbits - 5)
                let ixval = descale(Int32(d[x * 2]) * iw00 + Int32(d[x * 2 + 2]) * iw01 + Int32(d1[x * 2]) * iw10 + Int32(d1[x * 2 + 2]) * iw11, wbits)
                let iyval = descale(Int32(d[x * 2 + 1]) * iw00 + Int32(d[x * 2 + 3]) * iw01 + Int32(d1[x * 2 + 1]) * iw10 + Int32(d1[x * 2 + 3]) * iw11, wbits)
                pi[x] = Int16(truncatingIfNeeded: ival)
                pd[x * 2] = Int16(truncatingIfNeeded: ixval)
                pd[x * 2 + 1] = Int16(truncatingIfNeeded: iyval)
                iA11 += Int64(ixval * ixval); iA12 += Int64(ixval * iyval); iA22 += Int64(iyval * iyval)
              }
            }
            let A11 = Float(iA11) * fltScale, A12 = Float(iA12) * fltScale, A22 = Float(iA22) * fltScale
            var D = A11 * A22 - A12 * A12
            let minEig = (A22 + A11 - ((A11 - A22) * (A11 - A22) + 4 * A12 * A12).squareRoot()) / Float(2 * winSize * winSize)
            if minEig < 1e-4 || D < Float.ulpOfOne {
              if level == 0 { stp[i] = false }
              continue
            }
            D = 1 / D
            nextPt = (nextPt.0 - half, nextPt.1 - half)
            var prevDelta: (Float, Float) = (0, 0)
            for j in 0 ..< 30 {
              let inx = Int(nextPt.0.rounded(.down)), iny = Int(nextPt.1.rounded(.down))
              if inx < -winSize || inx >= J.w || iny < -winSize || iny >= J.h {
                if level == 0 { stp[i] = false }
                break
              }
              a = nextPt.0 - Float(inx); b = nextPt.1 - Float(iny)
              iw00 = Int32(((1 - a) * (1 - b) * one).rounded()); iw01 = Int32((a * (1 - b) * one).rounded())
              iw10 = Int32(((1 - a) * b * one).rounded()); iw11 = (1 << wbits) - iw00 - iw01 - iw10
              var ib1: Int64 = 0, ib2: Int64 = 0
              for y in 0 ..< winSize {
                let s = jp + (y + iny + J.pad) * jstride + inx + J.pad, s1 = s + jstride
                let pi = patchI + y * winSize, pd = patchD + y * winSize * 2
                for x in 0 ..< winSize {
                  let diff = descale(Int32(s[x]) * iw00 + Int32(s[x + 1]) * iw01 + Int32(s1[x]) * iw10 + Int32(s1[x + 1]) * iw11, wbits - 5) - Int32(pi[x])
                  ib1 += Int64(diff * Int32(pd[x * 2])); ib2 += Int64(diff * Int32(pd[x * 2 + 1]))
                }
              }
              let b1 = Float(ib1) * fltScale, b2 = Float(ib2) * fltScale
              let delta = ((A12 * b2 - A22 * b1) * D, (A12 * b1 - A11 * b2) * D)
              nextPt = (nextPt.0 + delta.0, nextPt.1 + delta.1)
              outp[i] = (nextPt.0 + half, nextPt.1 + half)
              if delta.0 * delta.0 + delta.1 * delta.1 <= eps { break }
              if j > 0 && abs(delta.0 + prevDelta.0) < 0.01 && abs(delta.1 + prevDelta.1) < 0.01 {
                outp[i] = (outp[i].0 - delta.0 * 0.5, outp[i].1 - delta.1 * 0.5)
                break
              }
              prevDelta = delta
            }
          }
        }
      }
    }
  }
  return (out, status)
}

// cv::RNG, so the RANSAC draws the same samples as OpenCV
private struct CvRNG {
  var state: UInt64 = UInt64.max
  mutating func next() -> UInt32 {
    state = UInt64(UInt32(truncatingIfNeeded: state)) &* 4_164_903_690 &+ (state >> 32)
    return UInt32(truncatingIfNeeded: state)
  }
  mutating func uniform(_ n: Int) -> Int { Int(next() % UInt32(n)) }
}

// similarity [a -b tx; b a ty] through two point pairs
private func similarityFrom2(_ f: [(Float, Float)], _ t: [(Float, Float)]) -> Affine? {
  let x1 = Double(f[0].0), y1 = Double(f[0].1), x2 = Double(f[1].0), y2 = Double(f[1].1)
  let u1 = Double(t[0].0), v1 = Double(t[0].1), u2 = Double(t[1].0), v2 = Double(t[1].1)
  let dx = x2 - x1, dy = y2 - y1, den = dx * dx + dy * dy
  if den == 0 { return nil }
  let du = u2 - u1, dv = v2 - v1
  let a = (du * dx + dv * dy) / den, b = (dv * dx - du * dy) / den
  return [a, -b, u1 - a * x1 + b * y1, b, a, v1 - b * x1 - a * y1]
}

// least-squares similarity over the inliers (what OpenCV's LM refinement converges to)
private func similarityLS(_ f: [(Float, Float)], _ t: [(Float, Float)]) -> Affine? {
  var sx = 0.0, sy = 0.0, su = 0.0, sv = 0.0, sxx = 0.0, sxu = 0.0, sxv = 0.0
  let n = Double(f.count)
  for i in 0 ..< f.count {
    let x = Double(f[i].0), y = Double(f[i].1), u = Double(t[i].0), v = Double(t[i].1)
    sx += x; sy += y; su += u; sv += v
    sxx += x * x + y * y
    sxu += x * u + y * v
    sxv += x * v - y * u
  }
  let den = sxx - (sx * sx + sy * sy) / n
  if den == 0 { return nil }
  let a = (sxu - (sx * su + sy * sv) / n) / den
  let b = (sxv - (sx * sv - sy * su) / n) / den
  return [a, -b, (su - a * sx + b * sy) / n, b, a, (sv - b * sx - a * sy) / n]
}

// cv2.estimateAffinePartial2D(from, to, method=RANSAC, ransacReprojThreshold) with the
// defaults (2000 iterations, confidence 0.99, 10 refinement iterations). Returns the
// affine and the RANSAC inlier count.
func estimateAffinePartial2D(from f: [(Float, Float)], to t: [(Float, Float)], threshold: Double) -> (affine: Affine, inliers: Int)? {
  let n = f.count
  if n < 2 { return nil }
  var rng = CvRNG()
  let t2 = Float(threshold * threshold)
  var best: Affine?, bestMask = [Bool](repeating: false, count: n), bestCount = 0
  var niters = 2000, iter = 0
  func inliers(_ M: Affine) -> ([Bool], Int) {
    var mask = [Bool](repeating: false, count: n), c = 0
    for i in 0 ..< n {
      let x = Double(f[i].0), y = Double(f[i].1)
      let dx = Float(M[0] * x + M[1] * y + M[2]) - t[i].0, dy = Float(M[3] * x + M[4] * y + M[5]) - t[i].1
      if dx * dx + dy * dy <= t2 { mask[i] = true; c += 1 }
    }
    return (mask, c)
  }
  while iter < niters {
    var idx = [Int](), attempts = 0
    if n > 2 {
      while attempts < 10000 {
        idx = []
        while idx.count < 2 {
          let k = rng.uniform(n)
          if !idx.contains(k) { idx.append(k) }
        }
        attempts += 1
        if f[idx[0]] != f[idx[1]] && t[idx[0]] != t[idx[1]] { break }
      }
      if attempts >= 10000 { if iter == 0 { return nil }; break }
    } else {
      idx = [0, 1]
    }
    if let M = similarityFrom2([f[idx[0]], f[idx[1]]], [t[idx[0]], t[idx[1]]]) {
      let (mask, c) = inliers(M)
      if c > max(bestCount, 1) {
        best = M; bestMask = mask; bestCount = c
        // RANSACUpdateNumIters(0.99, outliers, 2, niters)
        let ep = Double(n - c) / Double(n)
        let denom = 1 - (1 - ep) * (1 - ep)
        if denom < Double.leastNormalMagnitude {
          niters = 0
        } else {
          let num = log(max(1 - 0.99, Double.leastNormalMagnitude)), ld = log(denom)
          niters = ld >= 0 || -num >= Double(2000) * -ld ? 2000 : Int((num / ld).rounded())
        }
      }
    }
    iter += 1
  }
  guard var M = best else { return nil }
  var fi = [(Float, Float)](), ti = [(Float, Float)]()
  for i in 0 ..< n where bestMask[i] { fi.append(f[i]); ti.append(t[i]) }
  if let refined = similarityLS(fi, ti) { M = refined }
  return (M, bestCount)
}
