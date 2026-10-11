import AVFoundation
import ExpoModulesCore

struct TranscodeOptions: Record {
  @Field var uri: String = ""
  @Field var startS: Double = 0
  @Field var endS: Double = 0
  @Field var width: Int = 0
  @Field var height: Int = 0
  @Field var fps: Double = 30
  @Field var dropToFps: Bool = false
  @Field var bitrate: Int = 8_000_000
}

final class NoVideoTrackException: Exception {
  override var reason: String { "The clip has no video track" }
}

final class TranscodeFailedException: GenericException<String> {
  override var reason: String { "Could not prepare the clip: \(param)" }
}

private let rec709: [String: Any] = [
  AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
  AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
  AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
]

private func fileURL(_ uri: String) -> URL {
  if let url = URL(string: uri), url.scheme != nil { return url }
  return URL(fileURLWithPath: uri)
}

public class ClipTranscoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClipTranscoder")

    Events("onProgress")

    AsyncFunction("probe") { (uri: String) async throws -> [String: Any] in
      let asset = AVURLAsset(url: fileURL(uri))
      guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw NoVideoTrackException() }
      let (size, transform, fps) = try await track.load(.naturalSize, .preferredTransform, .nominalFrameRate)
      let duration = try await asset.load(.duration)
      let shown = size.applying(transform)
      return ["width": abs(shown.width), "height": abs(shown.height), "fps": Double(fps), "durationS": duration.seconds]
    }

    AsyncFunction("transcode") { (o: TranscodeOptions) async throws -> [String: Any] in
      try await self.transcode(o)
    }
  }

  // Trim + scale + re-encode to H.264 with AVAssetReader/Writer. Every source frame
  // keeps its timestamp, so the frame rate (60/120/240 slo-mo) survives; with
  // dropToFps, frames closer than 1/fps to the last kept one are skipped. No audio.
  private func transcode(_ o: TranscodeOptions) async throws -> [String: Any] {
    let asset = AVURLAsset(url: fileURL(o.uri))
    guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw NoVideoTrackException() }
    let transform = try await track.load(.preferredTransform)
    let rotated = abs(transform.b) == 1 && abs(transform.c) == 1
    let (encW, encH) = rotated ? (o.height, o.width) : (o.width, o.height)

    let start = CMTime(seconds: o.startS, preferredTimescale: 600)
    let end = CMTime(seconds: o.endS, preferredTimescale: 600)
    let reader = try AVAssetReader(asset: asset)
    reader.timeRange = CMTimeRange(start: start, end: end)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
      AVVideoColorPropertiesKey: rec709,
    ])
    output.alwaysCopiesSampleData = false
    reader.add(output)

    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("clip-transcoder", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent("\(UUID().uuidString).mp4")

    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: encW,
      AVVideoHeightKey: encH,
      AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill,
      AVVideoColorPropertiesKey: rec709,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: o.bitrate,
        AVVideoExpectedSourceFrameRateKey: o.fps,
        AVVideoMaxKeyFrameIntervalKey: max(1, Int(o.fps.rounded())),
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ])
    input.expectsMediaDataInRealTime = false
    input.transform = transform
    writer.add(input)

    guard reader.startReading() else { throw TranscodeFailedException(reader.error?.localizedDescription ?? "reader") }
    guard writer.startWriting() else { throw TranscodeFailedException(writer.error?.localizedDescription ?? "writer") }

    let span = max(o.endS - o.startS, 0.001)
    let minGap = o.dropToFps ? 0.9 / o.fps : 0
    var first: CMTime?
    var last: CMTime?
    var frames = 0
    var sentProgress = -1.0
    var done = false
    let queue = DispatchQueue(label: "catchline.clip-transcoder")

    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      func finish(_ error: Error?) {
        if done { return }
        done = true
        if let error {
          reader.cancelReading()
          writer.cancelWriting()
          cont.resume(throwing: error)
          return
        }
        input.markAsFinished()
        writer.finishWriting {
          if writer.status == .completed && frames > 0 {
            cont.resume()
          } else {
            cont.resume(throwing: TranscodeFailedException(writer.error?.localizedDescription ?? "no frames"))
          }
        }
      }
      input.requestMediaDataWhenReady(on: queue) {
        while !done && input.isReadyForMoreMediaData {
          guard let buffer = output.copyNextSampleBuffer() else {
            finish(reader.status == .failed ? TranscodeFailedException(reader.error?.localizedDescription ?? "read") : nil)
            return
          }
          let pts = CMSampleBufferGetPresentationTimeStamp(buffer)
          if let l = last, (pts - l).seconds < minGap { continue }
          if first == nil {
            writer.startSession(atSourceTime: pts)
            first = pts
          }
          if !input.append(buffer) {
            finish(TranscodeFailedException(writer.error?.localizedDescription ?? "append"))
            return
          }
          last = pts
          frames += 1
          let p = min(max((pts.seconds - o.startS) / span, 0), 1)
          if p - sentProgress >= 0.02 {
            sentProgress = p
            self.sendEvent("onProgress", ["progress": p])
          }
        }
      }
    }

    let size = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
    let durationS = max(((last ?? .zero) - (first ?? .zero)).seconds, 0)
    let fps = frames > 1 && durationS > 0 ? Double(frames - 1) / durationS : o.fps
    return [
      "uri": url.absoluteString,
      "size": size,
      "width": o.width,
      "height": o.height,
      "fps": fps,
      "frames": frames,
      "durationS": durationS,
    ]
  }
}
