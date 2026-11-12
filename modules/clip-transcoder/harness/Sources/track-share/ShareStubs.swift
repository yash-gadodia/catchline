// ShareRenderer.swift (the 3.x share video) needs UIKit and stays out of the macOS build; these stand in for the
// three names ClipTranscoderModule.swift takes from it.
import ExpoModulesCore

struct ShareSpec {}

final class ShareRenderFailedException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "Could not make the share video: \(param)" }
}

func renderShareVideo(uri: String, spec: ShareSpec, progress: @escaping (Double) -> Void) async throws -> [String: Any] {
  throw ShareRenderFailedException("not built on macOS")
}
