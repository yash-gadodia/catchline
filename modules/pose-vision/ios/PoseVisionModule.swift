import ExpoModulesCore

struct AnalyzePoseOptions: Record {
  @Field var fps: Double = 0
  @Field var maxSide: Int = 0
}

final class PoseFailedException: GenericException<String> {
  override var reason: String { "Could not read body pose: \(param)" }
}

private func fileURL(_ uri: String) -> URL {
  if let url = URL(string: uri), url.scheme != nil { return url }
  return URL(fileURLWithPath: uri)
}

public class PoseVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PoseVision")

    Events("onProgress")

    AsyncFunction("analyzePose") { (uri: String, o: AnalyzePoseOptions) async throws -> [String: Any] in
      do {
        return try await analyzePoseVision(url: fileURL(uri), options: PoseVisionOptions(fps: o.fps, maxSide: o.maxSide)) { p in
          self.sendEvent("onProgress", ["progress": p])
        }
      } catch {
        throw PoseFailedException(String(describing: error))
      }
    }
  }
}
