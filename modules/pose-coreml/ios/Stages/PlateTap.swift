import CoreGraphics
import Foundation
import Vision

// A plate the user pointed at, followed over the whole clip with no leash to the hands, by two things that must
// agree. Apple's object tracker says where the box around the plate went (it holds through the blur of the pull and
// on camo, speckled and plain faces alike, but once the plate leaves it settles on whatever is there, sure of
// itself: a knee, a chest, a shadow). The ring profile (Plates.swift) says whether what is there still looks like
// the plate from its centre outwards, and puts the centre on it. A frame is held only when the rings match near
// the tracker's box; the tracker is put back on the rings' centre when the two drift apart. After a third of a
// second unheld, a plate with steps or texture of its own is looked for again around where it was last held, and
// the tracker restarted on it.

private func trackBox(_ c: Point, _ r: Double, _ q: Double) -> CGRect {
  CGRect(x: c.x - r * q, y: c.y - r, width: 2 * r * q, height: 2 * r)
}

private final class BoxTrack {
  private let handler = VNSequenceRequestHandler()
  private var seen: VNDetectedObjectObservation
  private let width: Double, height: Double

  // box: the plate on the seed image, in its pixels (y down)
  init?(seed: CGImage, box: CGRect) {
    width = Double(seed.width)
    height = Double(seed.height)
    let b = box.intersection(CGRect(x: 0, y: 0, width: width, height: height))
    guard b.width > 4, b.height > 4 else { return nil }
    seen = VNDetectedObjectObservation(boundingBox: CGRect(x: b.minX / width, y: 1 - b.maxY / height, width: b.width / width, height: b.height / height))
    guard step(seed) != nil else { return nil }
  }

  // the box's centre on the next image (pixels, y down), nil when the tracker failed
  func step(_ image: CGImage) -> Point? {
    let request = VNTrackObjectRequest(detectedObjectObservation: seen)
    request.trackingLevel = .accurate
    guard (try? handler.perform([request], on: image)) != nil, let o = request.results?.first as? VNDetectedObjectObservation else { return nil }
    seen = o
    return Point(o.boundingBox.midX * width, (1 - o.boundingBox.midY) * height)
  }
}

private let tapAgree = 0.35, tapResync = 0.2, tapRefindAfter = 10

final class TapFollow {
  private var box: BoxTrack?
  private(set) var ring: RingTrack

  init?(seed: Plate, image: CGImage, gray: GrayImage, minRadius: Double) {
    guard let r = RingTrack(seed: seed, gray: gray, minRadius: minRadius) else { return nil }
    ring = r
    box = BoxTrack(seed: image, box: trackBox(r.centre, r.radius, r.ratio))
    guard box != nil else { return nil }
  }

  // a second follow from the same start, for the other direction in time
  init?(from other: TapFollow, image: CGImage) {
    ring = other.ring
    box = BoxTrack(seed: image, box: trackBox(ring.centre, ring.radius, ring.ratio))
    guard box != nil else { return nil }
  }

  // One frame: 1 when the plate is held there (ring.centre, ring.radius and ring.score say where and how well).
  func step(_ image: CGImage, _ gray: GrayImage) -> Int {
    let at = box?.step(image)
    if let c = at, let m = ringSearch(gray, ring, around: c, span: tapAgree, steps: 15, scales: [0.94, 1.0, 1.06]), m.score >= ringHold {
      let off = m.centre - c
      ringAccept(gray, &ring, m)
      if (off.x * off.x + off.y * off.y).squareRoot() > tapResync * ring.radius {
        box = BoxTrack(seed: image, box: trackBox(ring.centre, ring.radius, ring.ratio)) ?? box
      }
      return 1
    }
    ring.lost += 1
    ring.velocity = Point(0, 0)
    guard ring.lost >= tapRefindAfter, ring.lost % 3 == 0, ring.profile.marked else { return 0 }
    let span = min(3.0, 1.2 + 0.05 * Double(ring.lost))
    guard let m = ringSearch(gray, ring, around: ring.centre, span: span, steps: Int((2 * span / 0.1).rounded()) + 1, scales: [1.0]),
          m.score >= ringFind, m.peak >= ringPeak else { return 0 }
    ringAccept(gray, &ring, m)
    box = BoxTrack(seed: image, box: trackBox(ring.centre, ring.radius, ring.ratio)) ?? box
    return 1
  }
}
