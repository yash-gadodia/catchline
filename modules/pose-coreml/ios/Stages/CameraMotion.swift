import Foundation

// track.py foreground_mask, stabilise (one step) and camera_path (one step). Signatures in StageAPI.swift.
// Stub: the camera-motion stage has not landed yet.

func grayscale(_ img: BGRImage) -> GrayImage {
  var out = [UInt8](repeating: 0, count: img.width * img.height)
  img.data.withUnsafeBufferPointer { s in
    for i in 0 ..< out.count {
      let v = 0.114 * Double(s[i * 3]) + 0.587 * Double(s[i * 3 + 1]) + 0.299 * Double(s[i * 3 + 2])
      out[i] = UInt8(min(max(v.rounded(), 0), 255))
    }
  }
  return GrayImage(width: img.width, height: img.height, data: out)
}

func foregroundMask(width: Int, height: Int, boxes: [Box], wrists: (Point, Point)?, scale: Double) throws -> Mask {
  throw StageError.notImplemented("foregroundMask")
}

func cameraMotionStep(prev: GrayImage, cur: GrayImage, foreground: Mask, params: KLTParams) throws -> (affine: Affine, inliers: Int)? {
  throw StageError.notImplemented("cameraMotionStep")
}
