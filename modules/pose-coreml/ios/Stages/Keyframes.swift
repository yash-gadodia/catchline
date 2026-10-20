import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

// cv/catchline_cv/pipeline.py read_frame + export_keyframes: one JPEG per key
// frame, the upright frame scaled to KEYFRAME_H (1080) px tall, quality 85.
// Nothing is drawn or blurred (owner decision 18-10, a06a172): `blur` is accepted
// for the StageAPI.swift contract and ignored. Pure AVFoundation and ImageIO so a
// macOS CLI runs it for parity.

let keyframeHeight = 1080
// ImageIO's scale is not libjpeg's: cv2 q85 lands between ImageIO 0.60 and 0.70 by bytes
// and at 0.70 by PSNR (sweep on a 1920x1080 and a 608x1080 frame, 20-10)
let keyframeJPEGQuality = 0.70

struct KeyframeJob {
  let frame: Int
  let name: String  // file name the pipeline chose, e.g. r1-3-catch.jpg
}

enum KeyframeError: Error {
  case noVideoTrack
  case readFailed(String)
}

// ffmpeg `scale=-2:H`: av_rescale rounds half away from zero, then up to even.
func keyframeWidth(displayWidth: Double, displayHeight: Double, height: Int = keyframeHeight) -> Int {
  let w = Int((displayWidth * Double(height) / displayHeight).rounded(.toNearestOrAwayFromZero))
  return (w + 1) / 2 * 2
}

// The frame (already keyframeHeight tall) as JPEG bytes. cv2.imwrite q85 is libjpeg;
// here it is ImageIO at the quality that matches it (see keyframeJPEGQuality).
func keyframeJPEG(_ img: BGRImage, blur: [Box]) throws -> Data {
  guard img.data.count == img.width * img.height * 3 else { throw StageError.invalid("keyframeJPEG: \(img.data.count) bytes for \(img.width)x\(img.height)") }
  return try jpegData(img, quality: keyframeJPEGQuality)
}

func jpegData(_ img: BGRImage, quality: Double) throws -> Data {
  var bgra = [UInt8](repeating: 255, count: img.width * img.height * 4)
  img.data.withUnsafeBufferPointer { s in
    for i in 0 ..< img.width * img.height {
      bgra[i * 4] = s[i * 3]; bgra[i * 4 + 1] = s[i * 3 + 1]; bgra[i * 4 + 2] = s[i * 3 + 2]
    }
  }
  let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
  let out = NSMutableData()
  guard let provider = CGDataProvider(data: Data(bgra) as CFData),
        let cg = CGImage(width: img.width, height: img.height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: img.width * 4,
                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info, provider: provider, decode: nil,
                         shouldInterpolate: false, intent: .defaultIntent),
        let dest = CGImageDestinationCreateWithData(out, "public.jpeg" as CFString, 1, nil) else {
    throw StageError.invalid("keyframeJPEG: image")
  }
  CGImageDestinationAddImage(dest, cg, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
  guard CGImageDestinationFinalize(dest) else { throw StageError.invalid("keyframeJPEG: encode") }
  return out as Data
}

// The sample covering `start`, converted while the reader is still alive
// (alwaysCopiesSampleData is off, so the buffer is the reader's).
private func decodeFrame(_ asset: AVAsset, _ track: AVAssetTrack, from start: CMTime, rotation: Int, outW: Int) throws -> BGRImage? {
  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  ])
  output.alwaysCopiesSampleData = false
  reader.add(output)
  reader.timeRange = CMTimeRange(start: start, duration: .positiveInfinity)
  guard reader.startReading() else { throw KeyframeError.readFailed(reader.error?.localizedDescription ?? "reader") }
  defer { reader.cancelReading() }
  while let sample = output.copyNextSampleBuffer() {
    if let pb = CMSampleBufferGetImageBuffer(sample) {
      return uprightBGR(pb, rotation: rotation, outW: outW, outH: keyframeHeight)
    }
  }
  if reader.status == .failed { throw KeyframeError.readFailed(reader.error?.localizedDescription ?? "read") }
  return nil
}

// read_frame for every index in `frames`: the upright 1080 px frame, keyed by the
// requested index. A frame past the end steps back until one decodes
// (export_keyframes clamps to n - 1). `fps` is the rate the pipeline indexes
// frames with (the pose result's fps).
func keyframeImages(url: URL, fps: Double, frames: [Int]) async throws -> [Int: BGRImage] {
  let asset = AVURLAsset(url: url)
  guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw KeyframeError.noVideoTrack }
  let (natural, transform, range) = try await track.load(.naturalSize, .preferredTransform, .timeRange)
  let rotation = rotationDegrees(transform)
  let shown = natural.applying(transform)
  let outW = keyframeWidth(displayWidth: abs(shown.width), displayHeight: abs(shown.height))
  var out: [Int: BGRImage] = [:]
  for want in Set(frames) {
    var f = max(want, 0)
    var img: BGRImage?
    while img == nil {
      // the reader returns the sample whose duration covers `start`, so aim at the middle of frame f
      // (not half a frame early as video.frames() seeks ffmpeg: that returns frame f - 1 here)
      let start = CMTimeAdd(range.start, CMTime(seconds: (Double(f) + 0.5) / fps, preferredTimescale: 600_000))
      img = try autoreleasepool { try decodeFrame(asset, track, from: start, rotation: rotation, outW: outW) }
      if img == nil {
        guard f > 0 else { throw KeyframeError.readFailed("no frames decoded") }
        f -= 1
      }
    }
    out[want] = img
  }
  return out
}

// export_keyframes: <dir>/<name> for every job. Returns name -> path.
func exportKeyframes(url: URL, fps: Double, jobs: [KeyframeJob], to dir: URL) async throws -> [String: String] {
  let images = try await keyframeImages(url: url, fps: fps, frames: jobs.map(\.frame))
  try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  var paths: [String: String] = [:]
  for job in jobs {
    let out = dir.appendingPathComponent(job.name)
    try keyframeJPEG(images[job.frame]!, blur: []).write(to: out)
    paths[job.name] = out.path
  }
  return paths
}
