import Foundation

// track.py find_plates, refine_plate and track_plate (one step). Signatures in StageAPI.swift.
// Stub: the plate stage has not landed yet.

func findPlates(_ img: BGRImage, wristA: Point, wristB: Point, bodyH: Double, setupH: Double?) throws -> [Plate] {
  throw StageError.notImplemented("findPlates")
}

func refinePlate(_ img: BGRImage, _ plate: Plate) throws -> Plate? {
  throw StageError.notImplemented("refinePlate")
}

func trackPlateStep(_ img: BGRImage, _ track: inout PlateTrack) throws {
  throw StageError.notImplemented("trackPlateStep")
}
