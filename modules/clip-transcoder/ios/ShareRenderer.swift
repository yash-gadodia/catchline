import AVFoundation
import CoreImage
import ExpoModulesCore
import UIKit

struct SharePoint: Record {
  @Field var t: Double = 0
  @Field var x: Double = 0
  @Field var y: Double = 0
}

struct ShareSegment: Record {
  @Field var startS: Double = 0
  @Field var endS: Double = 0
  @Field var rate: Double = 1
}

struct ShareRect: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0
}

struct ShareText: Record {
  @Field var text: String = ""
  @Field var fonts: [String] = []
  @Field var size: Double = 40
  @Field var color: String = "#FFFFFF"
  @Field var tracking: Double = 0
  @Field var upper: Bool = false
}

struct ShareStack: Record {
  @Field var x: Double = 0
  @Field var bottom: Double = 0
  @Field var width: Double = 0
  @Field var gap: Double = 0
  @Field var items: [ShareText] = []
}

struct ShareWordmark: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var size: Double = 44
  @Field var text: ShareText = ShareText()
}

struct ShareSpec: Record {
  @Field var width: Int = 1080
  @Field var height: Int = 1920
  @Field var fps: Double = 30
  @Field var segments: [ShareSegment] = []
  @Field var durationS: Double = 0
  @Field var video: ShareRect = ShareRect()
  @Field var path: [SharePoint] = []
  @Field var pathColor: String = "#FF1F3D"
  @Field var pathWidth: Double = 10
  @Field var dots: [SharePoint] = []
  @Field var dotColor: String = "#EDE9E1"
  @Field var dotRadius: Double = 9
  @Field var scrimFrom: Double = 960
  @Field var stack: ShareStack = ShareStack()
  @Field var wordmark: ShareWordmark? = nil
}

final class ShareRenderFailedException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "Could not render the share video: \(param)" }
}

private func uiColor(_ hex: String, _ alpha: CGFloat = 1) -> UIColor {
  let v = UInt64(hex.replacingOccurrences(of: "#", with: ""), radix: 16) ?? 0
  return UIColor(
    red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: alpha
  )
}

private func font(_ t: ShareText) -> UIFont {
  for name in t.fonts {
    if let f = UIFont(name: name, size: t.size) { return f }
  }
  return UIFont.systemFont(ofSize: t.size, weight: .heavy)
}

private func attributed(_ t: ShareText) -> NSAttributedString {
  NSAttributedString(string: t.upper ? t.text.uppercased() : t.text, attributes: [
    .font: font(t),
    .kern: t.tracking,
    .foregroundColor: uiColor(t.color),
  ])
}

private func drawText(_ t: ShareText, in ctx: CGContext, x: Double, bottom: Double, width: Double) -> Double {
  let s = attributed(t)
  let h = ceil(s.boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin], context: nil).height)
  ctx.saveGState()
  ctx.setShadow(offset: .zero, blur: 10, color: UIColor.black.withAlphaComponent(0.45).cgColor)
  s.draw(with: CGRect(x: x, y: bottom - h, width: width, height: h), options: [.usesLineFragmentOrigin], context: nil)
  ctx.restoreGState()
  return Double(h)
}

// The Catchline monogram (brand/mark.svg, viewBox 160): a bone C with the flare dot on its top tip.
private func drawMark(_ ctx: CGContext, size: Double, at o: CGPoint) {
  let k = size / 160
  let a = atan2(32.0, 38.0)
  ctx.saveGState()
  ctx.setStrokeColor(uiColor("#EDE9E1").cgColor)
  ctx.setLineWidth(26 * k)
  ctx.setLineCap(.round)
  ctx.addArc(center: CGPoint(x: o.x + 80 * k, y: o.y + 80 * k), radius: hypot(38.0, 32.0) * k, startAngle: -a, endAngle: a, clockwise: true)
  ctx.strokePath()
  ctx.setFillColor(uiColor("#FF1F3D").cgColor)
  ctx.fillEllipse(in: CGRect(x: o.x + (118 - 17) * k, y: o.y + (48 - 17) * k, width: 34 * k, height: 34 * k))
  ctx.restoreGState()
}

private func renderer(_ size: CGSize) -> UIGraphicsImageRenderer {
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = false
  return UIGraphicsImageRenderer(size: size, format: format)
}

// What never moves: the scrim, the label/number/cue stack and the wordmark.
private func staticOverlay(_ spec: ShareSpec, size: CGSize) -> CIImage? {
  let image = renderer(size).image { r in
    let ctx = r.cgContext
    let colors = [UIColor.black.withAlphaComponent(0).cgColor, UIColor.black.withAlphaComponent(0.78).cgColor] as CFArray
    if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
      ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: spec.scrimFrom), end: CGPoint(x: 0, y: size.height), options: [.drawsAfterEndLocation])
    }
    var bottom = spec.stack.bottom
    for item in spec.stack.items.reversed() {
      bottom -= drawText(item, in: ctx, x: spec.stack.x, bottom: bottom, width: spec.stack.width) + spec.stack.gap
    }
    if let w = spec.wordmark {
      drawMark(ctx, size: w.size, at: CGPoint(x: w.x, y: w.y))
      let h = ceil(attributed(w.text).size().height)
      _ = drawText(w.text, in: ctx, x: w.x + w.size + 12, bottom: w.y + (w.size + h) / 2, width: 600)
    }
  }
  return image.cgImage.map { CIImage(cgImage: $0) }
}

// The path drawn up to output time t, its moving head, and the phase dots reached so far.
private func pathOverlay(_ spec: ShareSpec, size: CGSize, at t: Double) -> CIImage? {
  var pts: [CGPoint] = []
  for (i, p) in spec.path.enumerated() {
    if p.t <= t {
      pts.append(CGPoint(x: p.x, y: p.y))
    } else {
      if i > 0 {
        let a = spec.path[i - 1]
        let f = (t - a.t) / max(p.t - a.t, 0.0001)
        pts.append(CGPoint(x: a.x + (p.x - a.x) * f, y: a.y + (p.y - a.y) * f))
      }
      break
    }
  }
  let dots = spec.dots.filter { $0.t <= t }
  if pts.isEmpty && dots.isEmpty { return nil }
  let image = renderer(size).image { r in
    let ctx = r.cgContext
    let flare = uiColor(spec.pathColor).cgColor
    if pts.count > 1 {
      ctx.saveGState()
      ctx.setShadow(offset: .zero, blur: 14, color: uiColor(spec.pathColor, 0.7).cgColor)
      ctx.setStrokeColor(flare)
      ctx.setLineWidth(spec.pathWidth)
      ctx.setLineCap(.round)
      ctx.setLineJoin(.round)
      ctx.addLines(between: pts)
      ctx.strokePath()
      ctx.restoreGState()
    }
    ctx.setFillColor(uiColor(spec.dotColor).cgColor)
    for d in dots {
      let r = spec.dotRadius
      ctx.fillEllipse(in: CGRect(x: d.x - r, y: d.y - r, width: r * 2, height: r * 2))
    }
    if let head = pts.last {
      let r = spec.pathWidth * 1.3
      let rect = CGRect(x: head.x - r, y: head.y - r, width: r * 2, height: r * 2)
      ctx.setFillColor(flare)
      ctx.fillEllipse(in: rect)
      ctx.setStrokeColor(uiColor(spec.dotColor).cgColor)
      ctx.setLineWidth(3)
      ctx.strokeEllipse(in: rect)
    }
  }
  return image.cgImage.map { CIImage(cgImage: $0) }
}

private func orientation(_ t: CGAffineTransform) -> CGImagePropertyOrientation {
  if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
  if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
  if t.a == -1 && t.d == -1 { return .down }
  return .up
}

// The lifter's clip, trimmed to the rep (stretches slowed per segment), placed in
// spec.video on black, with the bar path drawing in sync and the text on top.
// Drawn per frame with Core Image + Core Graphics (Core Animation's offline
// renderer crashes on the simulator). H.264 MP4, no audio, in the temp directory.
func renderShareVideo(uri: String, spec: ShareSpec, onProgress: @escaping (Double) -> Void) async throws -> [String: Any] {
  let asset = AVURLAsset(url: fileURL(uri))
  guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw NoVideoTrackException() }
  let (natural, transform) = try await track.load(.naturalSize, .preferredTransform)
  let assetEnd = try await asset.load(.duration).seconds

  let comp = AVMutableComposition()
  guard let out = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
    throw ShareRenderFailedException("track")
  }
  var cursor = CMTime.zero
  for s in spec.segments {
    let end = min(s.endS, assetEnd)
    if end <= s.startS { continue }
    let range = CMTimeRange(start: CMTime(seconds: s.startS, preferredTimescale: 600), end: CMTime(seconds: end, preferredTimescale: 600))
    try out.insertTimeRange(range, of: track, at: cursor)
    if s.rate != 1 {
      let scaled = CMTime(seconds: range.duration.seconds / s.rate, preferredTimescale: 600)
      out.scaleTimeRange(CMTimeRange(start: cursor, duration: range.duration), toDuration: scaled)
      cursor = cursor + scaled
    } else {
      cursor = cursor + range.duration
    }
  }
  if cursor.seconds <= 0 { throw ShareRenderFailedException("the rep is outside the clip") }

  let size = CGSize(width: spec.width, height: spec.height)
  let staticImage = staticOverlay(spec, size: size)
  let upright = orientation(transform)
  let black = CIImage(color: .black).cropped(to: CGRect(origin: .zero, size: size))
  let shown = CGRect(origin: .zero, size: natural).applying(transform)
  // Core Image's origin is bottom-left; the spec is top-left.
  let videoY = Double(size.height) - spec.video.y - spec.video.height

  let composition = AVMutableVideoComposition(asset: comp) { request in
    var frame = request.sourceImage
    if abs(frame.extent.width - abs(shown.width)) > 1 || abs(frame.extent.height - abs(shown.height)) > 1 {
      frame = frame.oriented(upright)
    }
    frame = frame.transformed(by: CGAffineTransform(translationX: -frame.extent.minX, y: -frame.extent.minY))
    let sx = spec.video.width / frame.extent.width
    let sy = spec.video.height / frame.extent.height
    var img = frame
      .transformed(by: CGAffineTransform(scaleX: sx, y: sy))
      .transformed(by: CGAffineTransform(translationX: spec.video.x, y: videoY))
      .composited(over: black)
    if let s = staticImage { img = s.composited(over: img) }
    if let p = pathOverlay(spec, size: size, at: request.compositionTime.seconds) { img = p.composited(over: img) }
    request.finish(with: img.cropped(to: CGRect(origin: .zero, size: size)), context: nil)
  }
  composition.renderSize = size
  // iPhone clips are often HLG HDR: work in SDR Rec.709 so the overlay's white
  // is not tone-mapped down to grey with the frame.
  composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
  composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
  composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
  composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(max(spec.fps, 1)))

  let dir = FileManager.default.temporaryDirectory.appendingPathComponent("share-video", isDirectory: true)
  try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  let url = dir.appendingPathComponent("catchline-\(UUID().uuidString.prefix(8)).mp4")

  guard let session = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else {
    throw ShareRenderFailedException("export session")
  }
  session.outputURL = url
  session.outputFileType = .mp4
  session.shouldOptimizeForNetworkUse = true
  session.videoComposition = composition

  let ticker = Task {
    while !Task.isCancelled {
      onProgress(Double(session.progress))
      try? await Task.sleep(nanoseconds: 150_000_000)
    }
  }
  await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
    session.exportAsynchronously { cont.resume() }
  }
  ticker.cancel()
  guard session.status == .completed else {
    throw ShareRenderFailedException(session.error?.localizedDescription ?? "status \(session.status.rawValue)")
  }
  onProgress(1)
  return ["uri": url.absoluteString, "width": spec.width, "height": spec.height, "durationS": cursor.seconds]
}
