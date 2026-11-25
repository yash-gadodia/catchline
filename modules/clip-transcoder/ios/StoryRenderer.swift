import AVFoundation
import CoreImage
import CoreText

// 4.0.5 on: the share made for Instagram Stories, Reels and TikTok. A 9:16 canvas filled by the lift, the lift's
// number counting up in the lower third (clear of the apps' caption and buttons), a small mark under their header,
// the lift again at half speed, then the bar path alone as the end card with the lifter's invite line.
// Reels / TikTok cover the top ~14%, the bottom ~22% and the right ~13%: nothing that must be read goes there.

struct TrackStory: Decodable {
  var width: Int
  var height: Int
  // where to centre the crop, 0..1 of the clip's width (the middle of the bar path)
  var focusX: Double
  var hero: StoryHero?
  var replay: StoryReplay?
  var end: StoryEnd
  var mark: String
  var displayFonts: [String]
  var bodyFonts: [String]
}

struct StoryHero: Decodable {
  // the number (peak bar speed), counted up from 0 to peakFrame
  var value: Double
  var unit: String
  var label: String
  // movement, weight, date
  var kicker: String
  var peakFrame: Int
  // the bar's speed, [frame, m/s] (4.0.10 on): the number is the fastest the bar has gone so far, not a count-up
  var speeds: [[Double]]?
  // "Your fastest snatch", when it is
  var badge: String?
}

struct StoryReplay: Decodable {
  var from: Int
  var to: Int
  var speed: Double
}

struct StoryEnd: Decodable {
  var title: String
  var lines: [String]
  var s: Double
}

// Where the clip sits on the canvas, in canvas pixels (origin top-left).
struct StoryPlacement {
  let scale: Double
  let origin: CGPoint
  let clip: CGSize
  let canvas: CGSize
  // a wide clip fits the width over a blurred copy of itself instead of being cropped to a sliver
  let blurredBack: Bool
}

func storyPlacement(_ spec: TrackSpec, _ story: TrackStory, clip: CGSize) -> StoryPlacement {
  let canvas = CGSize(width: story.width, height: story.height)
  let cover = max(canvas.width / clip.width, canvas.height / clip.height)
  let wide = clip.width / clip.height > 0.8
  let s = wide ? canvas.width / clip.width : cover
  let w = clip.width * s
  let h = clip.height * s
  var x = canvas.width / 2 - story.focusX * w
  x = min(0, max(canvas.width - w, x))
  var y = (canvas.height - h) / 2
  if wide {
    // above the number, below the header
    y = canvas.height * 0.16
  } else {
    // the top of the bar path (the plate at the catch) below the apps' header
    let top = spec.path.map { $0[2] }.min() ?? 0.5
    if top * h + y < canvas.height * 0.2 { y = canvas.height * 0.2 - top * h }
    y = min(0, max(canvas.height - h, y))
  }
  return StoryPlacement(scale: s, origin: CGPoint(x: x, y: y), clip: clip, canvas: canvas, blurredBack: wide)
}

private func pickFont(_ names: [String], _ size: Double) -> CTFont {
  for name in names {
    let f = CTFontCreateWithName(name as CFString, size, nil)
    if CTFontCopyPostScriptName(f) as String == name { return f }
  }
  return CTFontCreateUIFontForLanguage(.emphasizedSystem, size, nil) ?? CTFontCreateWithName("Helvetica-Bold" as CFString, size, nil)
}

private typealias Line = (line: CTLine, width: Double, ascent: Double, descent: Double)

private func storyLine(_ text: String, _ fonts: [String], _ size: Double, _ color: CGColor, kern: Double = 0) -> Line {
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): pickFont(fonts, size),
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
    NSAttributedString.Key(kCTKernAttributeName as String): size * kern,
  ]))
  var ascent: CGFloat = 0
  var descent: CGFloat = 0
  let width = CTLineGetTypographicBounds(line, &ascent, &descent, nil)
  return (line, width, Double(ascent), Double(descent))
}

// The mark: monogram and wordmark, small, under the apps' header. A camera's signature, not an advert.
private func drawStoryMark(_ ctx: CGContext, _ st: TrackStyle, _ story: TrackStory, center: Bool) {
  let W = Double(story.width)
  let m = W * 0.04
  let word = storyLine(story.mark, story.displayFonts, W * 0.042, cgColor(st.bone), kern: 0.04)
  let total = m + W * 0.014 + word.width
  let x = center ? (W - total) / 2 : W * 0.067
  let y = Double(story.height) * 0.15
  ctx.saveGState()
  ctx.setShadow(offset: .zero, blur: W * 0.012, color: CGColor(gray: 0, alpha: 0.6))
  drawMonogram(ctx, st, size: m, at: CGPoint(x: x, y: y))
  drawText(ctx, word, baseline: CGPoint(x: x + m + W * 0.014, y: y + m / 2 + (word.ascent - word.descent) / 2))
  ctx.restoreGState()
}

// The lower third: a dark fade so the number reads on any floor, then badge, kicker, the number and its label.
private func drawStoryHero(_ ctx: CGContext, _ st: TrackStyle, _ story: TrackStory, value: Double) {
  guard let hero = story.hero else { return }
  let W = Double(story.width)
  let H = Double(story.height)
  ctx.saveGState()
  let fade = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [CGColor(gray: 0, alpha: 0), CGColor(gray: 0, alpha: 0.82)] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(fade, start: CGPoint(x: 0, y: H * 0.46), end: CGPoint(x: 0, y: H * 0.8), options: [.drawsAfterEndLocation])
  ctx.restoreGState()
  let x = W * 0.067
  let soft = cgColor(st.bone, 0.78)
  if let badge = hero.badge, !badge.isEmpty {
    drawText(ctx, storyLine(badge.uppercased(), story.displayFonts, W * 0.036, cgColor(st.flare), kern: 0.08), baseline: CGPoint(x: x, y: H * 0.548))
  }
  drawText(ctx, storyLine(hero.kicker, story.bodyFonts, W * 0.031, soft), baseline: CGPoint(x: x, y: H * 0.582))
  let number = storyLine(String(format: "%.2f", value), story.displayFonts, W * 0.2, cgColor(st.bone))
  drawText(ctx, number, baseline: CGPoint(x: x - W * 0.006, y: H * 0.705))
  drawText(ctx, storyLine(hero.unit, story.displayFonts, W * 0.07, cgColor(st.flare)), baseline: CGPoint(x: x + number.width + W * 0.012, y: H * 0.705))
  // large enough to read at a glance: at 0.031 the lifter took the number for a counter, not a peak
  drawText(ctx, storyLine(hero.label, story.bodyFonts, W * 0.042, cgColor(st.bone, 0.92)), baseline: CGPoint(x: x, y: H * 0.748))
}

// Under the number, when the lifter asked for the graph: the bar speed over the lift, the line so far bone on a faint
// whole, a flare dot where the bar is now. No plate behind it: the lower third is already dark.
private func drawStoryChart(_ ctx: CGContext, _ spec: TrackSpec, _ story: TrackStory, frame: Int) {
  guard let chart = spec.chart, chart.values.count > 1, chart.max > chart.min else { return }
  let first = Double(spec.startFrame ?? 0)
  let last = Double(spec.endFrame ?? max(spec.frameCount - 1, 1))
  guard last > first else { return }
  let st = spec.style
  let W = Double(story.width)
  let H = Double(story.height)
  let f = Double(frame)
  // clear of the apps' reply bar and caption, which cover the bottom sixth
  let plot = CGRect(x: W * 0.067, y: H * 0.772, width: W * 0.62, height: H * 0.055)
  let at = { (frame: Double, v: Double) in
    CGPoint(x: plot.minX + (min(max(frame, first), last) - first) / (last - first) * plot.width, y: plot.maxY - (v - chart.min) / (chart.max - chart.min) * plot.height)
  }
  ctx.saveGState()
  ctx.setLineCap(.round)
  ctx.setLineJoin(.round)
  if chart.min < 0 && chart.max > 0 {
    ctx.setStrokeColor(cgColor(st.bone, 0.3))
    ctx.setLineWidth(W * 0.002)
    ctx.move(to: at(first, 0))
    ctx.addLine(to: at(last, 0))
    ctx.strokePath()
  }
  let shown = chart.values.filter { $0[0] >= first && $0[0] <= last }
  for (alpha, pts) in [(0.35, shown), (1.0, shown.filter { $0[0] <= f })] where pts.count > 1 {
    ctx.setStrokeColor(cgColor(st.bone, alpha))
    ctx.setLineWidth(W * 0.005)
    ctx.addLines(between: pts.map { at($0[0], $0[1]) })
    ctx.strokePath()
  }
  if let now = shown.last(where: { $0[0] <= f }) {
    let c = at(now[0], now[1])
    let r = W * 0.011
    ctx.setFillColor(cgColor(st.flare))
    ctx.fillEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
  }
  ctx.restoreGState()
}

// The end card: black, the bar path drawn on as glowing art (over the first half of the card), the title with a flare
// full stop, and the lines under it (where it came from, the invite code).
func drawStoryEnd(_ ctx: CGContext, _ spec: TrackSpec, _ story: TrackStory, clip: CGSize, progress: Double) {
  let st = spec.style
  let W = Double(story.width)
  let H = Double(story.height)
  ctx.setFillColor(CGColor(gray: 0, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
  drawStoryMark(ctx, st, story, center: true)
  let pts = spec.path.map { CGPoint(x: $0[1] * clip.width, y: $0[2] * clip.height) }
  if pts.count > 1 {
    let xs = pts.map(\.x)
    let ys = pts.map(\.y)
    let bw = max(xs.max()! - xs.min()!, 1)
    let bh = max(ys.max()! - ys.min()!, 1)
    let k = min(W * 0.62 / bw, H * 0.34 / bh)
    let cx = W / 2
    let cy = H * 0.39
    let mapped = pts.map { CGPoint(x: cx + ($0.x - (xs.min()! + bw / 2)) * k, y: cy + ($0.y - (ys.min()! + bh / 2)) * k) }
    let shown = Array(mapped.prefix(max(2, Int((Double(mapped.count) * min(1, max(0, progress))).rounded()))))
    ctx.saveGState()
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.setShadow(offset: .zero, blur: W * 0.045, color: cgColor(st.flare, 0.9))
    ctx.setStrokeColor(cgColor(st.flare))
    ctx.setLineWidth(W * 0.011)
    ctx.addLines(between: shown)
    ctx.strokePath()
    let end = shown.last!
    let r = W * 0.016
    ctx.setFillColor(cgColor(st.flare))
    ctx.fillEllipse(in: CGRect(x: end.x - r, y: end.y - r, width: r * 2, height: r * 2))
    ctx.restoreGState()
  }
  let title = storyLine(story.end.title, story.displayFonts, W * 0.105, cgColor(st.bone))
  let stop = storyLine(".", story.displayFonts, W * 0.105, cgColor(st.flare))
  let tx = (W - title.width - stop.width) / 2
  drawText(ctx, title, baseline: CGPoint(x: tx, y: H * 0.665))
  drawText(ctx, stop, baseline: CGPoint(x: tx + title.width, y: H * 0.665))
  for (i, text) in story.end.lines.enumerated() {
    let l = storyLine(text, story.bodyFonts, W * 0.034, cgColor(st.bone, i == 0 ? 0.7 : 1))
    drawText(ctx, l, baseline: CGPoint(x: (W - l.width) / 2, y: H * 0.71 + Double(i) * W * 0.058))
  }
}

// One canvas frame: the clip placed (over its blurred self when wide), the tracker overlay in the clip's own
// coordinates, then the mark and the number on the canvas.
private func composeStory(
  _ sample: CMSampleBuffer, _ src: TrackSource, into out: CVPixelBuffer, ci: CIContext, spec: TrackSpec, scene: TrackSpec,
  story: TrackStory, place: StoryPlacement, frame: Int, value: Double?
) throws {
  guard let pixels = CMSampleBufferGetImageBuffer(sample) else { throw TrackRenderError(message: "frame \(frame) has no image") }
  var image = CIImage(cvPixelBuffer: pixels, options: [.colorSpace: NSNull()]).oriented(src.orientation)
  image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
  image = image.transformed(by: CGAffineTransform(scaleX: place.clip.width / image.extent.width, y: place.clip.height / image.extent.height))
  let canvas = CGRect(origin: .zero, size: place.canvas)
  // CI's origin is bottom-left
  let fg = image.transformed(by: CGAffineTransform(scaleX: place.scale, y: place.scale))
    .transformed(by: CGAffineTransform(translationX: place.origin.x, y: place.canvas.height - place.origin.y - place.clip.height * place.scale))
  var picture = fg
  if place.blurredBack {
    let cover = max(place.canvas.width / place.clip.width, place.canvas.height / place.clip.height)
    let back = image.transformed(by: CGAffineTransform(scaleX: cover, y: cover))
      .transformed(by: CGAffineTransform(translationX: (place.canvas.width - place.clip.width * cover) / 2, y: (place.canvas.height - place.clip.height * cover) / 2))
      .clampedToExtent()
      .applyingGaussianBlur(sigma: place.canvas.width * 0.03)
      .applyingFilter("CIColorControls", parameters: [kCIInputBrightnessKey: -0.25])
      .cropped(to: canvas)
    picture = fg.composited(over: back)
  } else {
    picture = fg.composited(over: CIImage(color: CIColor(red: 0, green: 0, blue: 0)).cropped(to: canvas))
  }
  ci.render(picture.cropped(to: canvas), to: out, bounds: canvas, colorSpace: nil)
  CVPixelBufferLockBaseAddress(out, [])
  defer { CVPixelBufferUnlockBaseAddress(out, []) }
  guard let ctx = bitmap(out) else { throw TrackRenderError(message: "bitmap") }
  ctx.translateBy(x: 0, y: place.canvas.height)
  ctx.scaleBy(x: 1, y: -1)
  ctx.saveGState()
  ctx.translateBy(x: place.origin.x, y: place.origin.y)
  ctx.scaleBy(x: place.scale, y: place.scale)
  ctx.clip(to: CGRect(origin: .zero, size: place.clip))
  drawTrack(ctx, spec: scene, frame: frame, size: place.clip, fullPath: false)
  ctx.restoreGState()
  drawStoryMark(ctx, spec.style, story, center: false)
  if let value { drawStoryHero(ctx, spec.style, story, value: value) }
  drawStoryChart(ctx, spec, story, frame: frame)
}

// The number on a frame of the first pass: the fastest the bar has gone so far, so it climbs as the lift does, never
// drops back and lands on the peak. Without the speeds (an older spec) it eases from 0 at the lift's start.
func storyValue(_ hero: StoryHero, frame: Int, first: Int) -> Double {
  guard hero.peakFrame > first, frame < hero.peakFrame else { return hero.value }
  if let speeds = hero.speeds, !speeds.isEmpty {
    let f = Double(frame)
    return min(hero.value, max(0, speeds.lazy.filter { $0[0] <= f }.map { $0[1] }.max() ?? 0))
  }
  let p = min(1, max(0, Double(frame - first) / Double(hero.peakFrame - first)))
  return hero.value * (1 - pow(1 - p, 3))
}

func renderStoryVideo(source: URL, to url: URL, spec: TrackSpec, onProgress: @escaping (Double) -> Void) async throws -> TrackVideoResult {
  guard let story = spec.story else { throw TrackRenderError(message: "no story") }
  let main = try await openTrackSource(source)
  let again = story.replay != nil ? try await openTrackSource(source) : nil
  return try await onQueue {
    let W = story.width
    let H = story.height
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let fps = max(spec.fps, 1)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: W,
      AVVideoHeightKey: H,
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: W * H * 6,
        AVVideoExpectedSourceFrameRateKey: fps,
        AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()),
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ])
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: bgra.merging([
      kCVPixelBufferWidthKey as String: W,
      kCVPixelBufferHeightKey as String: H,
    ]) { a, _ in a })
    writer.add(input)
    guard writer.startWriting() else { throw TrackRenderError(message: writer.error?.localizedDescription ?? "writer") }
    writer.startSession(atSourceTime: .zero)

    let ci = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
    let place = storyPlacement(spec, story, clip: CGSize(width: main.width, height: main.height))
    // the overlay the tracker screen draws, without the old lockup, graph and caption (the number replaces them)
    var scene = spec
    scene.brand = nil
    scene.watermark = nil
    scene.chart = nil
    scene.caption = nil
    let scale: CMTimeScale = 60000
    let nominal = CMTime(seconds: 1 / fps, preferredTimescale: scale)
    var cursor = CMTime.zero
    let first = spec.startFrame ?? 0
    let lastFrame = spec.endFrame ?? Int.max

    func newBuffer() throws -> CVPixelBuffer {
      var out: CVPixelBuffer?
      guard let pool = adaptor.pixelBufferPool, CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out) == kCVReturnSuccess, let out else {
        throw TrackRenderError(message: "pixel buffer")
      }
      return out
    }
    func emit(_ buffer: CVPixelBuffer, lasting length: CMTime, times: Int) throws {
      let len = max(CMTimeConvertScale(length, timescale: scale, method: .roundHalfAwayFromZero), CMTime(value: 1, timescale: scale))
      for _ in 0..<times {
        while !input.isReadyForMoreMediaData {
          if writer.status != .writing { throw TrackRenderError(message: writer.error?.localizedDescription ?? "writer stopped") }
          usleep(2000)
        }
        if !adaptor.append(buffer, withPresentationTime: cursor) { throw TrackRenderError(message: writer.error?.localizedDescription ?? "append") }
        cursor = cursor + len
      }
    }
    // One read of the clip: frames lo...hi, every `step`th, each written `repeats` times.
    func pass(_ src: TrackSource, lo: Int, hi: Int, speed: Double, value: (Int) -> Double?, progress: Bool) throws {
      let repeats = max(1, Int((1 / max(speed, 0.01)).rounded()))
      let step = max(1, Int(speed.rounded()))
      var frame = 0
      var held: (buffer: CVPixelBuffer, pts: CMTime)?
      var length = nominal
      while let sample = src.output.copyNextSampleBuffer() {
        try autoreleasepool {
          guard CMSampleBufferGetImageBuffer(sample) != nil else { return }
          defer { frame += 1 }
          if frame < lo || frame > hi || (step > 1 && (frame - lo) % step != 0) { return }
          let pts = CMSampleBufferGetPresentationTimeStamp(sample)
          let out = try newBuffer()
          try composeStory(sample, src, into: out, ci: ci, spec: spec, scene: scene, story: story, place: place, frame: frame, value: value(frame))
          if let h = held {
            if (pts - h.pts).seconds > 0 { length = CMTimeMultiplyByRatio(pts - h.pts, multiplier: 1, divisor: Int32(step)) }
            try emit(h.buffer, lasting: length, times: repeats)
          }
          held = (out, pts)
          if progress && frame % 5 == 0 { onProgress(min(Double(frame) / Double(max(spec.frameCount, 1)), 1) * 0.8) }
        }
      }
      if src.reader.status == .failed { throw TrackRenderError(message: src.reader.error?.localizedDescription ?? "read") }
      if let h = held { try emit(h.buffer, lasting: length, times: repeats) }
    }

    do {
      try pass(main, lo: first, hi: lastFrame, speed: spec.speed, value: { f in story.hero.map { storyValue($0, frame: f, first: first) } }, progress: true)
      if let replay = story.replay, let again {
        try pass(again, lo: replay.from, hi: replay.to, speed: replay.speed, value: { _ in story.hero?.value }, progress: false)
      } else {
        again?.reader.cancelReading()
      }
      let frames = max(1, Int((story.end.s * fps).rounded()))
      for i in 0..<frames {
        let card = try newBuffer()
        CVPixelBufferLockBaseAddress(card, [])
        if let ctx = bitmap(card) {
          ctx.translateBy(x: 0, y: CGFloat(H))
          ctx.scaleBy(x: 1, y: -1)
          drawStoryEnd(ctx, spec, story, clip: place.clip, progress: Double(i + 1) / (Double(frames) * 0.5))
        }
        CVPixelBufferUnlockBaseAddress(card, [])
        try emit(card, lasting: nominal, times: 1)
      }
    } catch {
      main.reader.cancelReading()
      again?.reader.cancelReading()
      writer.cancelWriting()
      throw error
    }

    input.markAsFinished()
    writer.endSession(atSourceTime: cursor)
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    guard writer.status == .completed else { throw TrackRenderError(message: writer.error?.localizedDescription ?? "finish") }
    onProgress(1)
    return TrackVideoResult(width: W, height: H, frames: spec.frameCount, durationS: cursor.seconds)
  }
}
