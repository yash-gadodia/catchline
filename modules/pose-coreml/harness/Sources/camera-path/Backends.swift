import CoreGraphics
import Foundation
import Vision

// The candidates the plan names, behind one call: the Stages KLT port (what ships) and Apple
// Vision's image registration (translation only, or a homography reduced to a similarity).
// Vision takes no mask, so the people move the estimate; the harness measures how much.

func motionStep(_ backend: String, prev: GrayImage, cur: GrayImage, foreground: Mask, params: KLTParams) throws -> (affine: Affine, inliers: Int)? {
  switch backend {
  case "klt": return try cameraMotionStep(prev: prev, cur: cur, foreground: foreground, params: params)
  case "vision-translation": return try visionStep(prev: prev, cur: cur, homography: false)
  case "vision-homography": return try visionStep(prev: prev, cur: cur, homography: true)
  default: throw StageError.invalid("unknown backend \(backend)")
  }
}

func cgImage(_ g: GrayImage) -> CGImage {
  let data = Data(g.data) as CFData
  let provider = CGDataProvider(data: data)!
  return CGImage(width: g.width, height: g.height, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: g.width,
                 space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0), provider: provider,
                 decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
}

// Vision aligns `cur` (the target) onto `prev` (the reference); its transform is in a y-up
// image space, so the translation's y is flipped and a homography is re-expressed in y-down px.
func visionStep(prev: GrayImage, cur: GrayImage, homography: Bool) throws -> (affine: Affine, inliers: Int)? {
  let handler = VNImageRequestHandler(cgImage: cgImage(prev), options: [:])
  let h = Double(prev.height)
  if !homography {
    let req = VNTranslationalImageRegistrationRequest(targetedCGImage: cgImage(cur), options: [:])
    try handler.perform([req])
    guard let obs = req.results?.first as? VNImageTranslationAlignmentObservation else { return nil }
    let t = obs.alignmentTransform
    return ([1, 0, Double(t.tx), 0, 1, -Double(t.ty)], 0)
  }
  let req = VNHomographicImageRegistrationRequest(targetedCGImage: cgImage(cur), options: [:])
  try handler.perform([req])
  guard let obs = req.results?.first as? VNImageHomographicAlignmentObservation else { return nil }
  let m = obs.warpTransform  // column-major 3x3 on y-up points
  func map(_ x: Double, _ y: Double) -> (Float, Float) {
    let yu = h - y
    let X = Double(m.columns.0.x) * x + Double(m.columns.1.x) * yu + Double(m.columns.2.x)
    let Y = Double(m.columns.0.y) * x + Double(m.columns.1.y) * yu + Double(m.columns.2.y)
    let W = Double(m.columns.0.z) * x + Double(m.columns.1.z) * yu + Double(m.columns.2.z)
    return (Float(X / W), Float(h - Y / W))
  }
  // reduce the homography to a similarity through a grid of points (least squares, no RANSAC)
  var from: [(Float, Float)] = [], to: [(Float, Float)] = []
  for gy in 0 ..< 6 {
    for gx in 0 ..< 6 {
      let x = Double(prev.width) * (Double(gx) + 0.5) / 6, y = h * (Double(gy) + 0.5) / 6
      from.append((Float(x), Float(y)))
      to.append(map(x, y))
    }
  }
  return estimateAffinePartial2D(from: from, to: to, threshold: 1e9)
}
