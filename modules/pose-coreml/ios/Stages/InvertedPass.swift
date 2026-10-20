import Foundation

// pose.py run_pose two_pass (kipping HSPU): rotate180, unrotate, merge_passes. Signatures in StageAPI.swift.
// Stub: the inverted pass has not landed yet.

func rotate180(_ img: BGRImage) throws -> BGRImage {
  throw StageError.notImplemented("rotate180")
}

func unrotate(_ people: [PosePerson], width: Int, height: Int) throws -> [PosePerson] {
  throw StageError.notImplemented("unrotate")
}

func mergePasses(upright: [PosePerson], rotated: [PosePerson], minIoU: Float = 0.3) throws -> [PosePerson] {
  throw StageError.notImplemented("mergePasses")
}
