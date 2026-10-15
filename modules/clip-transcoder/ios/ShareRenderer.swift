import AVFoundation
import ExpoModulesCore
import QuartzCore
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

final class ShareRenderFailedException: GenericException<String> {
  override var reason: String { "Could not render the share video: \(param)" }
}

private func color(_ hex: String, _ alpha: CGFloat = 1) -> CGColor {
  var v: UInt64 = 0
  Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
  return UIColor(
    red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: alpha
  ).cgColor
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
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): color(t.color),
  ])
}

private func textLayer(_ t: ShareText, x: Double, y: Double, width: Double) -> (CATextLayer, CGFloat) {
  let s = attributed(t)
  let h = ceil(s.boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin], context: nil).height)
  let layer = CATextLayer()
  layer.string = s
  layer.isWrapped = true
  layer.contentsScale = 1
  layer.frame = CGRect(x: x, y: y, width: width, height: Double(h))
  layer.shadowColor = UIColor.black.cgColor
  layer.shadowOpacity = 0.45
  layer.shadowRadius = 10
  layer.shadowOffset = .zero
  return (layer, h)
}

// The Catchline monogram (brand/mark.svg, viewBox 160): a bone C with the flare dot on its top tip.
private func markLayer(size: Double, at origin: CGPoint) -> CALayer {
  let k = size / 160
  let layer = CALayer()
  layer.frame = CGRect(x: origin.x, y: origin.y, width: size, height: size)
  let arc = CAShapeLayer()
  let r = hypot(38.0, 32.0) * k
  let a = atan2(32.0, 38.0)
  arc.path = UIBezierPath(arcCenter: CGPoint(x: 80 * k, y: 80 * k), radius: r, startAngle: -a, endAngle: a, clockwise: false).cgPath
  arc.strokeColor = color("#EDE9E1")
  arc.fillColor = nil
  arc.lineWidth = 26 * k
  arc.lineCap = .round
  layer.addSublayer(arc)
  let dot = CAShapeLayer()
  dot.path = UIBezierPath(arcCenter: CGPoint(x: 118 * k, y: 48 * k), radius: 17 * k, startAngle: 0, endAngle: .pi * 2, clockwise: true).cgPath
  dot.fillColor = color("#FF1F3D")
  layer.addSublayer(dot)
  return layer
}

private func beginAt(_ t: Double) -> CFTimeInterval {
  AVCoreAnimationBeginTimeAtZero + max(t, 0)
}

// Overlays live in a flipped container: Core Animation renders into the video
// with a bottom-left origin, and the spec is in top-left output pixels.
private func overlayLayer(_ spec: ShareSpec, size: CGSize) -> CALayer {
  let root = CALayer()
  root.frame = CGRect(origin: .zero, size: size)
  root.isGeometryFlipped = true
  let duration = max(spec.durationS, 0.1)

  let scrim = CAGradientLayer()
  scrim.frame = CGRect(x: 0, y: spec.scrimFrom, width: size.width, height: size.height - spec.scrimFrom)
  scrim.colors = [color("#000000", 0), color("#000000", 0.78)]
  root.addSublayer(scrim)

  if spec.path.count > 1 {
    let bez = UIBezierPath()
    var lengths: [Double] = [0]
    for (i, p) in spec.path.enumerated() {
      let pt = CGPoint(x: p.x, y: p.y)
      if i == 0 {
        bez.move(to: pt)
      } else {
        bez.addLine(to: pt)
        let prev = spec.path[i - 1]
        lengths.append(lengths[i - 1] + hypot(p.x - prev.x, p.y - prev.y))
      }
    }
    let total = max(lengths.last ?? 1, 0.001)
    let line = CAShapeLayer()
    line.frame = root.bounds
    line.path = bez.cgPath
    line.strokeColor = color(spec.pathColor)
    line.fillColor = nil
    line.lineWidth = spec.pathWidth
    line.lineCap = .round
    line.lineJoin = .round
    line.strokeEnd = 0
    line.shadowColor = color(spec.pathColor)
    line.shadowOpacity = 0.6
    line.shadowRadius = 12
    line.shadowOffset = .zero

    var keyTimes: [NSNumber] = [0]
    var ends: [Double] = [0]
    var heads: [NSValue] = [NSValue(cgPoint: CGPoint(x: spec.path[0].x, y: spec.path[0].y))]
    for (i, p) in spec.path.enumerated() {
      keyTimes.append(NSNumber(value: min(max(p.t / duration, keyTimes.last!.doubleValue), 1)))
      ends.append(lengths[i] / total)
      heads.append(NSValue(cgPoint: CGPoint(x: p.x, y: p.y)))
    }
    keyTimes.append(1)
    ends.append(1)
    heads.append(heads.last!)

    let draw = CAKeyframeAnimation(keyPath: "strokeEnd")
    draw.values = ends
    draw.keyTimes = keyTimes
    draw.calculationMode = .linear
    draw.beginTime = AVCoreAnimationBeginTimeAtZero
    draw.duration = duration
    draw.fillMode = .forwards
    draw.isRemovedOnCompletion = false
    line.add(draw, forKey: "draw")
    root.addSublayer(line)

    let head = CAShapeLayer()
    let r = spec.pathWidth * 1.3
    head.frame = CGRect(x: -r, y: -r, width: r * 2, height: r * 2)
    head.path = UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: r * 2, height: r * 2)).cgPath
    head.fillColor = color(spec.pathColor)
    head.strokeColor = color(spec.dotColor)
    head.lineWidth = 3
    head.position = heads[0].cgPointValue
    let move = CAKeyframeAnimation(keyPath: "position")
    move.values = heads
    move.keyTimes = keyTimes
    move.calculationMode = .linear
    move.beginTime = AVCoreAnimationBeginTimeAtZero
    move.duration = duration
    move.fillMode = .forwards
    move.isRemovedOnCompletion = false
    head.add(move, forKey: "move")
    root.addSublayer(head)
  }

  for d in spec.dots {
    let dot = CAShapeLayer()
    let r = spec.dotRadius
    dot.frame = CGRect(x: d.x - r, y: d.y - r, width: r * 2, height: r * 2)
    dot.path = UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: r * 2, height: r * 2)).cgPath
    dot.fillColor = color(spec.dotColor)
    dot.opacity = 0
    let show = CABasicAnimation(keyPath: "opacity")
    show.fromValue = 0
    show.toValue = 1
    show.beginTime = beginAt(d.t)
    show.duration = 0.12
    show.fillMode = .forwards
    show.isRemovedOnCompletion = false
    dot.add(show, forKey: "show")
    root.addSublayer(dot)
  }

  var bottom = spec.stack.bottom
  for item in spec.stack.items.reversed() {
    let (layer, h) = textLayer(item, x: spec.stack.x, y: 0, width: spec.stack.width)
    bottom -= Double(h)
    layer.frame.origin.y = bottom
    bottom -= spec.stack.gap
    root.addSublayer(layer)
  }

  if let w = spec.wordmark {
    root.addSublayer(markLayer(size: w.size, at: CGPoint(x: w.x, y: w.y)))
    let (layer, h) = textLayer(w.text, x: w.x + w.size + 12, y: 0, width: 600)
    layer.frame.origin.y = w.y + (w.size - Double(h)) / 2
    root.addSublayer(layer)
  }
  return root
}

// The lifter's clip, trimmed to the rep (stretches slowed per segment), placed in
// spec.video on black, with the bar path drawing in sync and the text on top.
// H.264 MP4, no audio, written to the caches directory.
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
  let shown = CGRect(origin: .zero, size: natural).applying(transform)
  let place = transform
    .concatenating(CGAffineTransform(translationX: -shown.minX, y: -shown.minY))
    .concatenating(CGAffineTransform(scaleX: spec.video.width / shown.width, y: spec.video.height / shown.height))
    .concatenating(CGAffineTransform(translationX: spec.video.x, y: spec.video.y))
  let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: out)
  layerInstruction.setTransform(place, at: .zero)
  let instruction = AVMutableVideoCompositionInstruction()
  instruction.timeRange = CMTimeRange(start: .zero, duration: cursor)
  instruction.layerInstructions = [layerInstruction]
  instruction.backgroundColor = color("#000000")

  let parent = CALayer()
  parent.frame = CGRect(origin: .zero, size: size)
  parent.backgroundColor = color("#000000")
  let videoLayer = CALayer()
  videoLayer.frame = parent.frame
  parent.addSublayer(videoLayer)
  parent.addSublayer(overlayLayer(spec, size: size))

  let composition = AVMutableVideoComposition()
  composition.renderSize = size
  composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(max(spec.fps, 1)))
  composition.instructions = [instruction]
  composition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

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
