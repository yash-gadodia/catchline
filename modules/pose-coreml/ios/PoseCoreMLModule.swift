import CoreML
import ExpoModulesCore

final class PoseFailedException: GenericException<String> {
  override var reason: String { "Could not read body pose: \(param)" }
}

private func fileURL(_ uri: String) -> URL {
  if let url = URL(string: uri), url.scheme != nil { return url }
  return URL(fileURLWithPath: uri)
}

// The compiled models ship in this pod's resource bundle (see the podspec).
private func modelDirectory() -> URL? {
  Bundle(for: PoseCoreMLModule.self).url(forResource: "PoseCoreMLModels", withExtension: "bundle")
}

public class PoseCoreMLModule: Module {
  private var models: PoseModels?

  public func definition() -> ModuleDefinition {
    Name("PoseCoreML")

    Events("onProgress")

    AsyncFunction("analyzePose") { (uri: String) async throws -> [String: Any] in
      do {
        if self.models == nil {
          guard let dir = modelDirectory() else { throw PoseCoreMLError.model("models missing from the app") }
          self.models = try PoseModels(directory: dir)
        }
        return try await analyzePoseCoreML(url: fileURL(uri), models: self.models!) { p in
          self.sendEvent("onProgress", ["progress": p])
        }
      } catch {
        throw PoseFailedException(String(describing: error))
      }
    }
  }
}
