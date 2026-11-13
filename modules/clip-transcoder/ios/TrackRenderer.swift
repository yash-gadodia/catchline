import AVFoundation
import CoreImage
import CoreText
import ImageIO
import UniformTypeIdentifiers

// The 4.0 share output: the lift's kept clip with what the tracker screen draws burned into every frame.
// No Expo and no UIKit here, so modules/clip-transcoder/harness runs the same code on a Mac.

// Sizes in output pixels, colours as #RRGGBB (src/features/share/trackShare.ts builds them from the design tokens).
struct TrackStyle: Decodable {
  var flare: String
  var halo: String
  var bone: String
  var pathWidth: Double
  var haloWidth: Double
  var boneWidth: Double
  var lineWidth: Double
  var dash: [Double]
  var lineAlpha: Double
  var dotRadius: Double
  var dotStroke: Double
  var jointRadius: Double
  var jointStroke: Double
  var markSize: Double
  var markInset: Double
  var markFonts: [String]
}

// Positions are 0..1 of the upright frame. A layer that is switched off arrives empty (or null).
struct TrackSpec: Decodable {
  var speed: Double
  // the frame of the share image
  var frame: Int
  var frameCount: Int
  var fps: Double
  // [frame, x, y] per traced point
  var path: [[Double]]
  var startX: Double?
  var floorY: Double?
  // per frame: x1, y1, x2, y2 for every bone, and x, y for every joint
  var bones: [[Double]]
  var joints: [[Double]]
  var watermark: String?
  var style: TrackStyle
}

struct TrackRenderError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

func decodeTrackSpec(_ json: String) throws -> TrackSpec {
  do {
    return try JSONDecoder().decode(TrackSpec.self, from: Data(json.utf8))
  } catch {
    throw TrackRenderError(message: "spec: \(error)")
  }
}

func orientation(_ t: CGAffineTransform) -> CGImagePropertyOrientation {
  if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
  if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
  if t.a == -1 && t.d == -1 { return .down }
  return .up
}

private func cgColor(_ hex: String, _ alpha: CGFloat = 1) -> CGColor {
  let v = UInt64(hex.replacingOccurrences(of: "#", with: ""), radix: 16) ?? 0
  return CGColor(
    srgbRed: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: alpha
  )
}

// src/analysis/timeline.ts pointAt: the traced point on a frame, interpolated between its neighbours.
private func pointAt(_ path: [[Double]], _ frame: Double) -> (x: Double, y: Double)? {
  guard let first = path.first, let last = path.last else { return nil }
  if frame <= first[0] { return (first[1], first[2]) }
  if frame >= last[0] { return (last[1], last[2]) }
  for i in 1..<path.count where frame <= path[i][0] {
    let a = path[i - 1]
    let b = path[i]
    let t = (frame - a[0]) / (b[0] - a[0])
    return (a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
  }
  return (last[1], last[2])
}

private func markFont(_ style: TrackStyle) -> CTFont {
  for name in style.markFonts {
    let f = CTFontCreateWithName(name as CFString, style.markSize, nil)
    if CTFontCopyPostScriptName(f) as String == name { return f }
  }
  return CTFontCreateUIFontForLanguage(.emphasizedSystem, style.markSize, nil) ?? CTFontCreateWithName("Helvetica-Bold" as CFString, style.markSize, nil)
}

// One frame's overlay, in the order TrackerScreen draws it: lines, body, path, dot, then the wordmark.
// ctx has its origin top-left. fullPath draws the whole path (the share image) instead of the path so far.
func drawTrack(_ ctx: CGContext, spec: TrackSpec, frame: Int, size: CGSize, fullPath: Bool) {
  let st = spec.style
  let pt = { (x: Double, y: Double) in CGPoint(x: x * size.width, y: y * size.height) }
  let f = Double(frame)

  if spec.startX != nil || spec.floorY != nil {
    ctx.saveGState()
    ctx.setStrokeColor(cgColor(st.bone, st.lineAlpha))
    ctx.setLineWidth(st.lineWidth)
    ctx.setLineDash(phase: 0, lengths: st.dash.map { CGFloat($0) })
    if let x = spec.startX {
      ctx.move(to: pt(x, 0))
      ctx.addLine(to: pt(x, 1))
    }
    if let y = spec.floorY {
      ctx.move(to: pt(0, y))
      ctx.addLine(to: pt(1, y))
    }
    ctx.strokePath()
    ctx.restoreGState()
  }

  ctx.setLineCap(.round)
  ctx.setLineJoin(.round)

  let bones = frame < spec.bones.count ? spec.bones[frame] : []
  for (color, width) in [(cgColor(st.halo), st.haloWidth), (cgColor(st.bone), st.boneWidth)] {
    ctx.setStrokeColor(color)
    ctx.setLineWidth(width)
    for i in stride(from: 0, to: bones.count - 3, by: 4) {
      ctx.move(to: pt(bones[i], bones[i + 1]))
      ctx.addLine(to: pt(bones[i + 2], bones[i + 3]))
    }
    ctx.strokePath()
  }
  let joints = frame < spec.joints.count ? spec.joints[frame] : []
  ctx.setFillColor(cgColor(st.bone))
  ctx.setStrokeColor(cgColor(st.halo))
  ctx.setLineWidth(st.jointStroke)
  for i in stride(from: 0, to: joints.count - 1, by: 2) {
    let c = pt(joints[i], joints[i + 1])
    let r = CGRect(x: c.x - st.jointRadius, y: c.y - st.jointRadius, width: st.jointRadius * 2, height: st.jointRadius * 2)
    ctx.fillEllipse(in: r)
    ctx.strokeEllipse(in: r)
  }

  if let first = spec.path.first, let last = spec.path.last {
    var pts: [CGPoint] = []
    if fullPath {
      pts = spec.path.map { pt($0[1], $0[2]) }
    } else if f >= first[0] {
      pts = spec.path.filter { $0[0] < f }.map { pt($0[1], $0[2]) }
      if let end = pointAt(spec.path, f) { pts.append(pt(end.x, end.y)) }
    }
    if pts.count > 1 {
      for (color, width) in [(cgColor(st.halo), st.haloWidth), (cgColor(st.flare), st.pathWidth)] {
        ctx.setStrokeColor(color)
        ctx.setLineWidth(width)
        ctx.addLines(between: pts)
        ctx.strokePath()
      }
    }
    if f >= first[0] && f <= last[0], let p = pointAt(spec.path, f) {
      let c = pt(p.x, p.y)
      let r = CGRect(x: c.x - st.dotRadius, y: c.y - st.dotRadius, width: st.dotRadius * 2, height: st.dotRadius * 2)
      ctx.setFillColor(cgColor(st.flare))
      ctx.fillEllipse(in: r)
      ctx.setStrokeColor(cgColor(st.halo))
      ctx.setLineWidth(st.dotStroke)
      ctx.strokeEllipse(in: r)
    }
  }

  if let text = spec.watermark, !text.isEmpty {
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [
      NSAttributedString.Key(kCTFontAttributeName as String): markFont(st),
      NSAttributedString.Key(kCTForegroundColorAttributeName as String): cgColor(st.bone),
      NSAttributedString.Key(kCTKernAttributeName as String): st.markSize * 0.02,
    ]))
    var descent: CGFloat = 0
    let width = CTLineGetTypographicBounds(line, nil, &descent, nil)
    ctx.saveGState()
    ctx.setShadow(offset: .zero, blur: st.markSize * 0.3, color: cgColor(st.halo, 0.7))
    ctx.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
    ctx.textPosition = CGPoint(x: size.width - st.markInset - width, y: size.height - st.markInset - descent)
    CTLineDraw(line, ctx)
    ctx.restoreGState()
  }
}

// The clip decoded in order as BGRA, so the nth buffer is trace frame n.
private struct TrackSource {
  let reader: AVAssetReader
  let output: AVAssetReaderTrackOutput
  let width: Int
  let height: Int
  let orientation: CGImagePropertyOrientation
}

private func openTrackSource(_ url: URL) async throws -> TrackSource {
  let asset = AVURLAsset(url: url)
  guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw TrackRenderError(message: "the clip has no video track") }
  let (natural, transform) = try await track.load(.naturalSize, .preferredTransform)
  let shown = CGRect(origin: .zero, size: natural).applying(transform)
  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    AVVideoColorPropertiesKey: [
      AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
      AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
      AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
  ])
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { throw TrackRenderError(message: reader.error?.localizedDescription ?? "reader") }
  return TrackSource(
    reader: reader, output: output, width: Int(abs(shown.width).rounded()), height: Int(abs(shown.height).rounded()), orientation: orientation(transform)
  )
}

private let bgra: [String: Any] = [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
  kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
]

private func bitmap(_ buffer: CVPixelBuffer) -> CGContext? {
  CGContext(
    data: CVPixelBufferGetBaseAddress(buffer),
    width: CVPixelBufferGetWidth(buffer),
    height: CVPixelBufferGetHeight(buffer),
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
    space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue
  )
}

// The decoded frame turned upright into `out`, with the overlay drawn on top.
private func compose(_ sample: CMSampleBuffer, _ src: TrackSource, into out: CVPixelBuffer, ci: CIContext, spec: TrackSpec, frame: Int, fullPath: Bool) throws {
  guard let pixels = CMSampleBufferGetImageBuffer(sample) else { throw TrackRenderError(message: "frame \(frame) has no image") }
  let size = CGSize(width: src.width, height: src.height)
  var image = CIImage(cvPixelBuffer: pixels, options: [.colorSpace: NSNull()]).oriented(src.orientation)
  image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
  if image.extent.width != size.width || image.extent.height != size.height {
    image = image.transformed(by: CGAffineTransform(scaleX: size.width / image.extent.width, y: size.height / image.extent.height))
  }
  ci.render(image, to: out, bounds: CGRect(origin: .zero, size: size), colorSpace: nil)
  CVPixelBufferLockBaseAddress(out, [])
  defer { CVPixelBufferUnlockBaseAddress(out, []) }
  guard let ctx = bitmap(out) else { throw TrackRenderError(message: "bitmap") }
  ctx.translateBy(x: 0, y: size.height)
  ctx.scaleBy(x: 1, y: -1)
  drawTrack(ctx, spec: spec, frame: frame, size: size, fullPath: fullPath)
}

private func onQueue<T>(_ work: @escaping () throws -> T) async throws -> T {
  try await withCheckedThrowingContinuation { cont in
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        cont.resume(returning: try work())
      } catch {
        cont.resume(throwing: error)
      }
    }
  }
}

struct TrackVideoResult {
  let width: Int
  let height: Int
  let frames: Int
  let durationS: Double
}

// Every frame of the clip, in order, with the overlay: H.264 MP4 at the clip's size, no audio. Each frame keeps its
// own timestamp and lasts until the next one's, so the frame rate is the clip's (variable rates included). At half or quarter speed every
// frame is written 2 or 4 times, one frame length apart: slower, at the same frame rate, with nothing dropped.
func renderTrackVideo(source: URL, to url: URL, spec: TrackSpec, onProgress: @escaping (Double) -> Void) async throws -> TrackVideoResult {
  let src = try await openTrackSource(source)
  return try await onQueue {
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let fps = max(spec.fps, 1)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: src.width,
      AVVideoHeightKey: src.height,
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: max(4_000_000, src.width * src.height * 6),
        AVVideoExpectedSourceFrameRateKey: fps,
        AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()),
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ])
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: bgra.merging([
      kCVPixelBufferWidthKey as String: src.width,
      kCVPixelBufferHeightKey as String: src.height,
    ]) { a, _ in a })
    writer.add(input)
    guard writer.startWriting() else { throw TrackRenderError(message: writer.error?.localizedDescription ?? "writer") }
    writer.startSession(atSourceTime: .zero)

    let ci = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
    let scale: CMTimeScale = 60000
    let repeats = max(1, Int((1 / max(spec.speed, 0.01)).rounded()))
    let nominal = CMTime(seconds: 1 / fps, preferredTimescale: scale)
    let tick = CMTime(value: 1, timescale: scale)
    var first: CMTime?
    var last = CMTime.invalid
    var end = CMTime.zero
    var frame = 0
    // A decoded frame does not say how long it lasts: each one is held until the next arrives, and lasts until then.
    var held: (buffer: CVPixelBuffer, pts: CMTime)?
    var length = nominal

    func write(_ buffer: CVPixelBuffer, at pts: CMTime, lasting length: CMTime) throws {
      let base = CMTimeMultiply(pts - (first ?? pts), multiplier: Int32(repeats))
      for n in 0..<repeats {
        var t = CMTimeConvertScale(base + CMTimeMultiply(length, multiplier: Int32(n)), timescale: scale, method: .roundHalfAwayFromZero)
        if last.isValid && t <= last { t = last + tick }
        while !input.isReadyForMoreMediaData {
          if writer.status != .writing { throw TrackRenderError(message: writer.error?.localizedDescription ?? "writer stopped") }
          usleep(2000)
        }
        if !adaptor.append(buffer, withPresentationTime: t) { throw TrackRenderError(message: writer.error?.localizedDescription ?? "append") }
        last = t
      }
      end = last + CMTimeConvertScale(length, timescale: scale, method: .roundHalfAwayFromZero)
    }

    do {
      while let sample = src.output.copyNextSampleBuffer() {
        try autoreleasepool {
          guard CMSampleBufferGetImageBuffer(sample) != nil else { return }
          let pts = CMSampleBufferGetPresentationTimeStamp(sample)
          if first == nil { first = pts }
          var out: CVPixelBuffer?
          guard let pool = adaptor.pixelBufferPool, CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out) == kCVReturnSuccess, let out else {
            throw TrackRenderError(message: "pixel buffer")
          }
          try compose(sample, src, into: out, ci: ci, spec: spec, frame: frame, fullPath: false)
          if let h = held {
            if (pts - h.pts).seconds > 0 { length = pts - h.pts }
            try write(h.buffer, at: h.pts, lasting: length)
          }
          held = (out, pts)
          frame += 1
          if frame % 5 == 0 { onProgress(min(Double(frame) / Double(max(spec.frameCount, 1)), 1)) }
        }
      }
      if src.reader.status == .failed { throw TrackRenderError(message: src.reader.error?.localizedDescription ?? "read") }
      guard let h = held else { throw TrackRenderError(message: "no frames") }
      try write(h.buffer, at: h.pts, lasting: length)
    } catch {
      src.reader.cancelReading()
      writer.cancelWriting()
      throw error
    }

    input.markAsFinished()
    writer.endSession(atSourceTime: end)
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    guard writer.status == .completed else { throw TrackRenderError(message: writer.error?.localizedDescription ?? "finish") }
    onProgress(1)
    return TrackVideoResult(width: src.width, height: src.height, frames: frame, durationS: end.seconds)
  }
}

// One frame of the clip (spec.frame, or the last one if the clip is shorter) as a JPEG with the whole path on it.
func renderTrackImage(source: URL, to url: URL, spec: TrackSpec) async throws -> (width: Int, height: Int) {
  let src = try await openTrackSource(source)
  return try await onQueue {
    var chosen: CMSampleBuffer?
    var frame = -1
    while frame < spec.frame, let sample = src.output.copyNextSampleBuffer() {
      if CMSampleBufferGetImageBuffer(sample) == nil { continue }
      chosen = sample
      frame += 1
    }
    src.reader.cancelReading()
    guard let chosen else { throw TrackRenderError(message: "no frames") }
    var out: CVPixelBuffer?
    guard CVPixelBufferCreate(nil, src.width, src.height, kCVPixelFormatType_32BGRA, bgra as CFDictionary, &out) == kCVReturnSuccess, let out else {
      throw TrackRenderError(message: "pixel buffer")
    }
    let ci = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
    try compose(chosen, src, into: out, ci: ci, spec: spec, frame: frame, fullPath: true)
    CVPixelBufferLockBaseAddress(out, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(out, .readOnly) }
    guard let image = bitmap(out)?.makeImage(),
      let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
    else { throw TrackRenderError(message: "image") }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw TrackRenderError(message: "jpeg") }
    return (src.width, src.height)
  }
}
