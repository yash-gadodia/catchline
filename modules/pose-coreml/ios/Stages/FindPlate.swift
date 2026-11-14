import AVFoundation
import CoreVideo
import Foundation

// The lifter's plate on one frame of the clip, before anything is tracked: the frame as the pose pass sees it, the
// person detector and pose on it, and PlateNet on the square the full run would look at around each person's hands
// (pipeline.ts NET_SIDE body heights). The full run knows its lifter from the whole clip; one frame of a busy gym does
// not (the tallest box there is as often someone standing behind), so here the lifter is whoever has a plate in their
// hands: plateNet.ts's start without a mark (a plate on the line of the hands), over everyone, the largest.
// Keeps no state and never touches DeviceAnalyser.run.

// pipeline.ts NET_SIDE, and plateNet.ts NET_CONF, SURE, LINE and NEAR
private let netSide = 1.6
let findPlateConf = 0.3
private let sureConf = 0.5
private let handsLine = 0.15
private let handsNear = 0.5
// a wrist scored under this is not seen; at most this many people (the tallest) are looked at
private let wristSeen: Float = 0.3
private let maxPeople = 8
// shoulder to ankle along the limbs is about this share of a standing body's height
private let limbShare = 0.8
private let L_SHO = 5, R_SHO = 6, L_WRI = 9, R_WRI = 10, L_HIP = 11, R_HIP = 12, L_KNE = 13, R_KNE = 14, L_ANK = 15, R_ANK = 16

struct FoundPlate {
  let x: Double  // centre, shares of the upright frame's width and height
  let y: Double
  let r: Double  // share of the frame's height
  let confidence: Double
}

private func finite(_ p: Point) -> Bool { p.x.isFinite && p.y.isFinite }

private func dist(_ a: Point, _ b: Point) -> Double { ((a - b) * (a - b)).sum().squareRoot() }

// plateNet.ts onHandsLine
private func onHandsLine(_ p: PlatePeak, _ a: Point, _ b: Point, bodyH: Double) -> Bool {
  if !finite(a) && !finite(b) { return false }
  if !finite(a) || !finite(b) || dist(a, b) < 0.1 * bodyH {
    let m = finite(a) && finite(b) ? (a + b) / 2 : finite(a) ? a : b
    return dist(p.centre, m) <= handsNear * bodyH
  }
  let d = b - a
  let off = abs(d.x * (p.centre.y - a.y) - d.y * (p.centre.x - a.x)) / dist(a, b)
  return off <= handsLine * bodyH + 0.5 * p.radius
}

extension ClipReader {
  // The frame on screen at `seconds` of the clip (the last one at the end of it), and its own time.
  func frame(atSeconds seconds: Double) async throws -> (CVPixelBuffer, Double)? {
    let duration = try await asset.load(.duration).seconds
    let t = max(0, min(seconds, duration - 1 / fps))
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    reader.add(output)
    // from half a second before, so the frame already on screen at t is among those read
    let from = max(0, t - 0.5)
    reader.timeRange = CMTimeRange(start: CMTime(seconds: from, preferredTimescale: 600), duration: .positiveInfinity)
    guard reader.startReading() else { throw PoseCoreMLError.readFailed(reader.error?.localizedDescription ?? "reader") }
    defer { reader.cancelReading() }
    var shown: (CVPixelBuffer, Double)?
    while let sample = output.copyNextSampleBuffer() {
      guard let pb = CMSampleBufferGetImageBuffer(sample) else { continue }
      let pts = CMSampleBufferGetPresentationTimeStamp(sample).seconds
      if pts > t + 0.5 / fps, shown != nil { break }
      shown = (pb, pts)
      if pts > t { break }
    }
    return shown
  }
}

// note: how the answer came about, for the harness
func findPlateInFrame(url: URL, atSeconds: Double, models: PoseModels, note: (String) -> Void = { _ in }) async throws -> FoundPlate? {
  guard let net = models.plate else { throw StageError.invalid("plate_net: no model") }
  let clip = try await ClipReader(url: url)
  guard let (pb, seconds) = try await clip.frame(atSeconds: atSeconds) else { return nil }
  let outW = clip.width(at: poseInferHeight)
  let img = uprightBGR(pb, rotation: clip.rotation, outW: outW, outH: poseInferHeight)
  let boxes = try detectPeople(img, models)
  note(String(format: "frame at %.4f s, %d people", seconds, boxes.count))
  var best: (peak: PlatePeak, held: Bool)?
  for box in boxes.sorted(by: { $0[3] - $0[1] > $1[3] - $1[1] }).prefix(maxPeople) {
    let (k, s) = try estimatePose(img, box: box, models)
    func at(_ j: Int) -> Point { Point(Double(k[j * 2]), Double(k[j * 2 + 1])) }
    func wrist(_ j: Int) -> Point { s[j] >= wristSeen ? at(j) : Point(.nan, .nan) }
    func limbs(_ sho: Int, _ hip: Int, _ knee: Int, _ ankle: Int) -> Double { dist(at(sho), at(hip)) + dist(at(hip), at(knee)) + dist(at(knee), at(ankle)) }
    // The full run's body height is the middle box height of the whole clip, so nearer standing than the box of a
    // lifter bent over the bar on this frame: the box, or the body's length along its limbs when that is more (to at
    // most twice the box, what bending over halves; a half-hidden person's limbs read any length).
    let boxH = Double(box[3] - box[1])
    let bodyH = max(boxH, min(2 * boxH, max(limbs(L_SHO, L_HIP, L_KNE, L_ANK), limbs(R_SHO, R_HIP, R_KNE, R_ANK)) / limbShare))
    let a = wrist(L_WRI), b = wrist(R_WRI)
    let hands = finite(a) || finite(b)
    // pipeline.ts handsFilled: the middle of the hands, or the one seen. With neither, the middle of the person's box:
    // the square is 1.6 body heights wide, so it still holds the whole person and the floor at their feet.
    let centre = finite(a) && finite(b) ? (a + b) / 2 : finite(a) ? a : finite(b) ? b : Point(Double(box[0] + box[2]) / 2, Double(box[1] + box[3]) / 2)
    let peaks = try plateNetPeaks(net, img, centre: centre, side: netSide * bodyH)
    // in the hands: on their line, as the full run starts. No hands to go by: only a plate the model is sure of.
    let held = peaks.filter { $0.radius > 0 && (hands ? $0.confidence >= findPlateConf && onHandsLine($0, a, b, bodyH: bodyH) : $0.confidence >= sureConf) }
    note(String(format: "person %.0f px tall (body %.0f), hands %@, square at (%.0f, %.0f), %d held; peaks (confidence, x, y, r px): ",
                boxH, bodyH, hands ? "seen" : "not seen", centre.x, centre.y, held.count)
      + peaks.map { String(format: "(%.2f, %.0f, %.0f, %.0f)", $0.confidence, $0.centre.x, $0.centre.y, $0.radius) }.joined(separator: " "))
    // the largest is the plate nearest the camera; one in somebody's hands beats one found without hands
    for p in held where best == nil || (hands && !best!.held) || (hands == best!.held && p.radius > best!.peak.radius) {
      best = (p, hands)
    }
  }
  guard let p = best?.peak else { return nil }
  let H = Double(poseInferHeight)
  return FoundPlate(x: p.centre.x / Double(outW), y: p.centre.y / H, r: p.radius / H, confidence: p.confidence)
}
