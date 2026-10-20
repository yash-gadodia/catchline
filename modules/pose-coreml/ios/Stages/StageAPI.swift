import Foundation

// The pixel stages of cv/catchline_cv (track.py, pose.py's second pass, pipeline.py's keyframes) as pure
// Swift functions, one file each under Stages/, called by AnalyseOnDevice.swift and by the macOS harness.
// Every signature lives here; each stage file holds the implementation (or a stub that throws
// StageError.notImplemented until it lands). Images are the BGRImage / PosePerson types from
// PoseCoreMLCore.swift, in the upright frame scaled to the height the caller says.
//
//   CameraMotion.swift   grayscale, foregroundMask, cameraMotionStep   (track.py foreground_mask, stabilise, camera_path)
//   Plates.swift         findPlates, refinePlate, trackPlateStep       (track.py find_plates, refine_plate, track_plate)
//   Keyframes.swift      keyframeJPEG                                  (pipeline.py export_keyframes + bystander blur)
//   InvertedPass.swift   rotate180, unrotate, mergePasses              (pose.py run_pose two_pass, unrotate, merge_passes)

enum StageError: Error, CustomStringConvertible {
  case notImplemented(String)
  case invalid(String)

  var description: String {
    switch self {
    case .notImplemented(let s): return "stage_missing: \(s) is not implemented"
    case .invalid(let s): return "plan_invalid: \(s)"
    }
  }
}

typealias Point = SIMD2<Double>  // NaN = unknown, as the pipeline's keypoints

// 2x3 affine, row-major [a, b, tx, c, d, ty]: maps (x, y) -> (a x + b y + tx, c x + d y + ty).
typealias Affine = [Double]

let identityAffine: Affine = [1, 0, 0, 0, 1, 0]

// One 8-bit plane, row-major, no padding. A Mask is 0 / 255 (cv2 convention).
struct GrayImage {
  let width: Int
  let height: Int
  var data: [UInt8]
}

typealias Mask = GrayImage

// x1, y1, x2, y2 in the image's pixels
typealias Box = [Double]

// track.py's plate dict: centre, axes = (vertical major, horizontal minor) full lengths, the fill score,
// which side of the hands it sits ("a" / "b" on the wrist line, "near" from the box search), and the
// fraction of outline points a refined fit explained (refine_plate only).
struct Plate {
  var centre: Point
  var axes: (Double, Double)
  var score: Double
  var side: String
  var fitInliers: Double?
}

// track.py track_plate's loop state: the plate re-detected every frame near a constant-velocity prediction.
// The caller sets it up from the seed plate, calls trackPlateStep on each following frame and reads
// centre / score after each step; once lost is true the track is over (the Python loop breaks).
struct PlateTrack {
  var axes: (Double, Double)  // M0, m0 of the seed plate
  var centre: Point
  var velocity: Point
  var score: Double
  var lost: Bool

  init(seed: Plate) {
    axes = seed.axes
    centre = seed.centre
    velocity = Point(0, 0)
    score = seed.score
    lost = false
  }
}

// goodFeaturesToTrack / calcOpticalFlowPyrLK / estimateAffinePartial2D parameters
struct KLTParams {
  let maxCorners: Int
  let minDistance: Double
  let winSize: Int
  let maxLevel: Int
  let ransacThreshold: Double

  // track.py stabilise: full-height window frames
  static let stabilise = KLTParams(maxCorners: 600, minDistance: 8, winSize: 21, maxLevel: 3, ransacThreshold: 2.0)
  // track.py camera_path: whole clip at 360 px tall
  static let cameraPath = KLTParams(maxCorners: 300, minDistance: 6, winSize: 15, maxLevel: 2, ransacThreshold: 1.5)
}

// --- CameraMotion.swift ---------------------------------------------------------------------------
//
// cv2.cvtColor(BGR2GRAY): round(0.299 R + 0.587 G + 0.114 B)
// func grayscale(_ img: BGRImage) -> GrayImage
//
// track.py foreground_mask: every box grown by 15% of its width and 8% of its height, filled; plus,
// when both wrists are finite, a band 2 * scale thick along the wrist line extended 3x past each end
// (cv2.line thickness int(2 * scale)). scale 0 and wrists nil give the box-only mask camera_path uses.
// func foregroundMask(width: Int, height: Int, boxes: [Box], wrists: (Point, Point)?, scale: Double) throws -> Mask
//
// One step of track.py stabilise / camera_path: corners on `prev` where `foreground == 0`
// (goodFeaturesToTrack quality 0.01), pyramidal LK to `cur`, estimateAffinePartial2D(p1 -> p0, RANSAC).
// Returns the affine mapping cur px -> prev px and the RANSAC inlier count; nil when fewer than 12
// corners are found or tracked, or the estimate fails (the caller then uses the identity and records
// no inlier count, as the Python loop does).
// func cameraMotionStep(prev: GrayImage, cur: GrayImage, foreground: Mask, params: KLTParams) throws -> (affine: Affine, inliers: Int)?

// --- Plates.swift ---------------------------------------------------------------------------------
//
// track.py find_plates on one frame: [near, far] (near = larger), fewer when not found, each a coarse
// ellipse fit. wristA / wristB may hold NaN (lifter not found in the frame): the search then finds nothing.
// func findPlates(_ img: BGRImage, wristA: Point, wristB: Point, bodyH: Double, setupH: Double?) throws -> [Plate]
//
// track.py refine_plate: the plate re-fitted to its own outline (RANSAC ellipse, both kernel scales), or
// nil when no fit held.
// func refinePlate(_ img: BGRImage, _ plate: Plate) throws -> Plate?
//
// track.py track_plate, one frame: re-detect near the predicted centre, refine the centre to 0.005
// plate heights and update the velocity. Sets track.lost when the score drops under 0.45 or the disc
// leaves the top of the frame; after that the caller stops calling.
// func trackPlateStep(_ img: BGRImage, _ track: inout PlateTrack) throws

// --- Keyframes.swift ------------------------------------------------------------------------------
//
// pipeline.py export_keyframes: the frame (already KEYFRAME_H = 1080 px tall) as JPEG quality 85, every
// box in `blur` (bystanders, in this image's pixels) blurred beyond recognition; the lifter is untouched.
// func keyframeJPEG(_ img: BGRImage, blur: [Box]) throws -> Data

// --- InvertedPass.swift ---------------------------------------------------------------------------
//
// pose.py run_pose two_pass: the frame rotated 180 degrees (img[::-1, ::-1], exact).
// func rotate180(_ img: BGRImage) throws -> BGRImage
//
// pose.py unrotate: detections made on the rotated frame mapped back to the upright one
// (box -> [W - x2, H - y2, W - x1, H - y1], keypoints -> (W - x, H - y); labels unchanged).
// func unrotate(_ people: [PosePerson], width: Int, height: Int) throws -> [PosePerson]
//
// pose.py merge_passes: per upright person the best-IoU (>= 0.3) rotated match, keeping whichever pass
// has the higher mean keypoint score; unmatched people from both passes kept, upright first.
// func mergePasses(upright: [PosePerson], rotated: [PosePerson], minIoU: Float = 0.3) throws -> [PosePerson]
